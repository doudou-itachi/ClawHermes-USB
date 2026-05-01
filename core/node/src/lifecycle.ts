import { execFileSync, spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdapterDescriptor, ServiceEnvironment } from "./types";
import { resolveServiceEnvironment } from "./environment";
import { resolveRelative, writeLog } from "./portable";
import { windowsPathToWslPath, wslAdapterCommandPlan } from "./wsl-adapter";
import { wslExecutableInvocation } from "./wsl";
import { expandCommandTemplate } from "./command-template";

export type ManagedProcessPlan = {
  runner?: string;
  executablePath: string;
  args: string[];
  command: string;
  workingDirectory: string;
  env?: NodeJS.ProcessEnv;
  metadata?: Record<string, unknown>;
};

export function startAdapter(root: string, adapter: AdapterDescriptor, options: { forceManaged?: boolean; processPlan?: ManagedProcessPlan; serviceEnv?: ServiceEnvironment } = {}) {
  const pidFile = resolveRelative(root, adapter.pidFile);
  const logFile = resolveRelative(root, adapter.logFile);
  const serviceEnv = options.serviceEnv ?? resolveServiceEnvironment(root, adapter.id);
  mkdirSync(dirname(pidFile), { recursive: true });
  mkdirSync(dirname(logFile), { recursive: true });
  const metadata = shouldLaunchManagedProcess(root, adapter, options.forceManaged === true)
    ? launchManagedAdapterProcess(root, adapter, serviceEnv, options.processPlan)
    : {
      serviceId: adapter.id,
      displayName: adapter.displayName,
      status: "placeholder-started",
      startedAt: new Date().toISOString(),
      command: adapter.commands.start ?? null,
      workingDirectory: resolveRelative(root, adapter.appDir),
      logFile,
      environment: environmentMetadata(serviceEnv),
      placeholder: true,
    };
  writeFileSync(pidFile, JSON.stringify(metadata, null, 2), "utf8");
  if (metadata.placeholder) {
    appendFileSync(logFile, `${new Date().toISOString()} [${adapter.id}] [INFO] Placeholder service started.\n`);
    writeLog(root, adapter.id, "INFO", "Started placeholder service.");
  } else if ("processId" in metadata) {
    writeLog(root, adapter.id, "INFO", `Started managed service process ${metadata.processId}.`);
  }
  return metadata;
}

function shouldLaunchManagedProcess(root: string, adapter: AdapterDescriptor, forceManaged: boolean): boolean {
  return (forceManaged || adapter.integration?.productionReady === true) && Boolean(adapter.commands.start) && appDirHasRealContent(root, adapter);
}

function appDirHasRealContent(root: string, adapter: AdapterDescriptor): boolean {
  const appDir = resolveRelative(root, adapter.appDir);
  try {
    return existsSync(appDir) && readdirSync(appDir).some((entry) => entry !== ".gitkeep");
  } catch {
    return false;
  }
}

function environmentMetadata(serviceEnv: ServiceEnvironment) {
  return {
    files: serviceEnv.files,
    variables: Object.keys(serviceEnv.env).sort(),
  };
}

function launchManagedAdapterProcess(root: string, adapter: AdapterDescriptor, serviceEnv: ServiceEnvironment, processPlan?: ManagedProcessPlan) {
  const commandTemplate = adapter.commands.start;
  if (!commandTemplate) throw new Error(`Adapter ${adapter.id} has no start command.`);
  prepareManagedServiceEnvironment(root, adapter, serviceEnv);
  const command = expandCommandTemplate(commandTemplate, serviceEnv.env);
  const workingDirectory = resolveRelative(root, adapter.appDir);
  const logFile = resolveRelative(root, adapter.logFile);
  const logFd = openSync(logFile, "a");
  try {
    const nativePlan = processPlan ? null : nativeManagedProcessPlan(command);
    const child = processPlan
      ? spawn(processPlan.executablePath, processPlan.args, {
        cwd: processPlan.workingDirectory,
        env: { ...process.env, ...(processPlan.env ?? {}) },
        detached: true,
        shell: false,
        stdio: ["ignore", logFd, logFd],
        windowsHide: true,
      })
      : nativePlan
        ? spawn(nativePlan.executablePath, nativePlan.args, {
          cwd: workingDirectory,
          env: { ...process.env, ...serviceEnv.env },
          detached: true,
          shell: false,
          stdio: ["ignore", logFd, logFd],
          windowsHide: true,
        })
      : spawn(command, {
        cwd: workingDirectory,
        env: { ...process.env, ...serviceEnv.env },
        detached: true,
        shell: true,
        stdio: ["ignore", logFd, logFd],
        windowsHide: true,
      });
    child.unref();
    return {
      serviceId: adapter.id,
      displayName: adapter.displayName,
      status: "running",
      processId: child.pid ?? 0,
      startedAt: new Date().toISOString(),
      command: processPlan?.command ?? command,
      workingDirectory: processPlan?.workingDirectory ?? workingDirectory,
      logFile,
      environment: environmentMetadata(serviceEnv),
      placeholder: false,
      ...(processPlan?.runner ? { runner: processPlan.runner } : {}),
      ...(processPlan?.metadata ?? {}),
    };
  } finally {
    closeSync(logFd);
  }
}

function prepareManagedServiceEnvironment(root: string, adapter: AdapterDescriptor, serviceEnv: ServiceEnvironment): void {
  ensureHermesConfigFile(serviceEnv);
  if (adapter.id === "openclaw") {
    prepareOpenClawEnvironment(root, serviceEnv);
  }
  if (adapter.id === "hermes-web-ui") {
    prepareHermesWebUiEnvironment(root, serviceEnv);
  }
}

function ensureHermesConfigFile(serviceEnv: ServiceEnvironment): void {
  const hermesHome = serviceEnv.env.HERMES_HOME;
  if (!hermesHome) return;

  const profileDir = activeHermesProfileDir(hermesHome);
  mkdirSync(profileDir, { recursive: true });
  const configPath = join(profileDir, "config.yaml");
  if (!existsSync(configPath)) {
    writeFileSync(configPath, "{}\n", "utf8");
  }
}

function activeHermesProfileDir(hermesHome: string): string {
  const activeProfilePath = join(hermesHome, "active_profile");
  try {
    const profileName = readFileSync(activeProfilePath, "utf8").trim();
    if (profileName && profileName !== "default") {
      const profileDir = join(hermesHome, "profiles", profileName);
      if (existsSync(profileDir)) return profileDir;
    }
  } catch {
    // Missing active_profile means Hermes uses the default profile.
  }
  return hermesHome;
}

function prepareOpenClawEnvironment(root: string, serviceEnv: ServiceEnvironment): void {
  const configPath = serviceEnv.env.OPENCLAW_CONFIG_PATH || join(root, "data", "openclaw", "openclaw.json");
  mkdirSync(dirname(configPath), { recursive: true });
  const existing = readJsonObject(configPath);
  const gateway = objectValue(existing.gateway);
  const logging = objectValue(existing.logging);
  const token = serviceEnv.env.OPENCLAW_GATEWAY_TOKEN || "clawhermes";
  const runtimeLogPath = windowsPathToWslPath(resolveRelative(root, "data/logs/openclaw-runtime.log"));
  writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        ...existing,
        gateway: {
          ...gateway,
          mode: "local",
          bind: "loopback",
          auth: {
            ...objectValue(gateway.auth),
            mode: "token",
            token,
          },
        },
        logging: {
          ...logging,
          file: runtimeLogPath,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function readJsonObject(path: string): Record<string, unknown> {
  try {
    return objectValue(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nativeManagedProcessPlan(command: string): { executablePath: string; args: string[] } | null {
  const parts = splitCommandLine(command);
  if (parts.length === 0) return null;
  const executable = parts[0].toLowerCase();
  if (!["node", "node.exe"].includes(executable)) return null;
  return { executablePath: parts[0], args: parts.slice(1) };
}

function splitCommandLine(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaping = false;
  for (const character of command) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\") {
      escaping = true;
      continue;
    }
    if ((character === '"' || character === "'") && (!quote || quote === character)) {
      quote = quote ? null : character;
      continue;
    }
    if (!quote && /\s/.test(character)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (escaping) current += "\\";
  if (current) parts.push(current);
  return parts;
}

function prepareHermesWebUiEnvironment(root: string, serviceEnv: ServiceEnvironment): void {
  const home = serviceEnv.env.HOME || join(root, "data", "home");
  const profileDir = join(home, ".hermes");
  mkdirSync(profileDir, { recursive: true });
  const configPath = join(profileDir, "config.yaml");
  writeFileSync(configPath, hermesWebUiProfileConfig(serviceEnv), "utf8");

  const envPath = join(profileDir, ".env");
  const apiKey = serviceEnv.env.API_SERVER_KEY || serviceEnv.env.AUTH_TOKEN || "clawhermes";
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `API_SERVER_KEY=${apiKey}\n`, "utf8");
  } else {
    const existing = readFileSync(envPath, "utf8");
    if (!/^API_SERVER_KEY\s*=/m.test(existing)) {
      const separator = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
      appendFileSync(envPath, `${separator}API_SERVER_KEY=${apiKey}\n`, "utf8");
    }
  }

  const shimDir = join(root, "data", "tmp", "bin", "hermes-web-ui");
  writeHermesWebUiShim(shimDir);
  const powershell = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  serviceEnv.env.HERMES_BIN = powershell;
  serviceEnv.env.CLAWHERMES_HERMES_WSL_DISTRO = serviceEnv.env.CLAWHERMES_HERMES_WSL_DISTRO || "ClawHermes-Ubuntu";
  serviceEnv.env.PSExecutionPolicyPreference = "Bypass";
  serviceEnv.env.PATH = [shimDir, serviceEnv.env.PATH || process.env.PATH || ""].filter(Boolean).join(";");
}

function hermesWebUiProfileConfig(serviceEnv: ServiceEnvironment): string {
  const upstream = serviceEnv.env.HERMES_AGENT_API_BASE || serviceEnv.env.UPSTREAM || "http://127.0.0.1:8642";
  let host = "127.0.0.1";
  let port = 8642;
  try {
    const parsed = new URL(upstream);
    host = parsed.hostname || host;
    port = Number(parsed.port) || port;
  } catch {
    // Keep defaults when the configured upstream is not a URL.
  }
  return [
    "platforms:",
    "  api_server:",
    "    enabled: true",
    "    key: ''",
    "    cors_origins: '*'",
    "    extra:",
    `      port: ${port}`,
    `      host: ${host}`,
    "",
  ].join("\n");
}

function writeHermesWebUiShim(shimDir: string): void {
  mkdirSync(shimDir, { recursive: true });
  const commonPath = join(shimDir, "hermes-wsl-command.ps1");
  writeFileSync(commonPath, hermesWslCommandScript(), "utf8");
  for (const command of ["gateway", "logs", "profile", "sessions", "setup"]) {
    writeFileSync(join(shimDir, `${command}.ps1`), hermesSubcommandScript(command), "utf8");
  }
}

function hermesSubcommandScript(command: string): string {
  return [
    `$env:CLAWHERMES_HERMES_SUBCOMMAND = '${command}'`,
    `& "$PSScriptRoot\\hermes-wsl-command.ps1" @args`,
    "exit $LASTEXITCODE",
    "",
  ].join("\n");
}

function hermesWslCommandScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$subcommand = $env:CLAWHERMES_HERMES_SUBCOMMAND",
    "if (-not $subcommand) { throw 'CLAWHERMES_HERMES_SUBCOMMAND is not set.' }",
    "$hermesArgs = @($subcommand) + @($args)",
    "if ($subcommand -eq 'gateway' -and $args.Count -gt 0 -and @('start', 'restart', 'stop') -contains $args[0]) {",
    "  Write-Output 'Hermes gateway is managed by ClawHermes-USB.'",
    "  exit 0",
    "}",
    "$root = $env:USB_ROOT",
    "if (-not $root) { throw 'USB_ROOT is not set.' }",
    "$wsl = $env:CLAWHERMES_WSL_EXE",
    "if (-not $wsl) { $wsl = 'wsl.exe' }",
    "$distro = $env:CLAWHERMES_HERMES_WSL_DISTRO",
    "if (-not $distro) { $distro = 'ClawHermes-Ubuntu' }",
    "function Convert-ToWslPath([string]$PathValue) {",
    "  if ($PathValue -match '^([A-Za-z]):[\\\\/]*(.*)$') {",
    "    $drive = $Matches[1].ToLowerInvariant()",
    "    $rest = $Matches[2].Replace('\\\\', '/').TrimStart('/')",
    "    return \"/mnt/$drive/$rest\"",
    "  }",
    "  return $PathValue",
    "}",
    "function ShellQuote([string]$Value) {",
    "  return \"'\" + $Value.Replace(\"'\", \"'`\\\"'`\\\"'\") + \"'\"",
    "}",
    "$appDir = Convert-ToWslPath (Join-Path $root 'apps\\hermes-agent')",
    "$exports = @()",
    "foreach ($name in @('USB_ROOT', 'HERMES_HOME', 'API_SERVER_KEY', 'HOME', 'USERPROFILE')) {",
    "  $value = [Environment]::GetEnvironmentVariable($name)",
    "  if ($value) { $exports += \"export $name=$(ShellQuote (Convert-ToWslPath $value))\" }",
    "}",
    "$quotedArgs = ($hermesArgs | ForEach-Object { ShellQuote $_ }) -join ' '",
    "$scriptParts = @($exports) + @(\"./venv/bin/hermes $quotedArgs\")",
    "$script = $scriptParts -join ' && '",
    "$wslArgs = @('--distribution', $distro, '--cd', $appDir, '--', 'bash', '-lc', $script)",
    "& $wsl @wslArgs",
    "exit $LASTEXITCODE",
    "",
  ].join("\n");
}

export function stopAdapter(root: string, adapter: AdapterDescriptor): boolean {
  const pidFile = resolveRelative(root, adapter.pidFile);
  if (!existsSync(pidFile)) {
    if (adapter.runtime?.kind === "wsl2" && adapter.commands.stop) {
      runWslStopHook(root, adapter);
      writeLog(root, adapter.id, "INFO", "Ran WSL2 stop hook without a managed pid file.");
      return true;
    }
    return false;
  }

  const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { placeholder?: boolean; processId?: number; runner?: string };
  if (metadata.placeholder === false && metadata.processId) {
    if (metadata.runner?.startsWith("wsl2") && adapter.commands.stop) {
      runWslStopHook(root, adapter);
    }
    try {
      killProcessTree(metadata.processId);
    } catch {
      // Already gone.
    }
  }
  rmSync(pidFile, { force: true });
  writeLog(root, adapter.id, "INFO", metadata.placeholder === false ? "Stopped managed service." : "Stopped placeholder service.");
  return true;
}

function runWslStopHook(root: string, adapter: AdapterDescriptor): void {
  const logFile = resolveRelative(root, adapter.logFile);
  mkdirSync(dirname(logFile), { recursive: true });
  try {
    const serviceEnv = resolveServiceEnvironment(root, adapter.id);
    const plan = wslAdapterCommandPlan(root, adapter, serviceEnv, "stop");
    const invocation = wslExecutableInvocation(plan.executablePath, plan.args);
    const completed = spawnSync(invocation.executablePath, invocation.args, {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    });
    appendFileSync(
      logFile,
      [
        `${new Date().toISOString()} [${adapter.id}] [INFO] WSL2 stop hook: ${plan.script}`,
        `exitCode: ${completed.status ?? "unknown"}`,
        completed.stdout ? `stdout:\n${completed.stdout}` : "stdout: <empty>",
        completed.stderr ? `stderr:\n${completed.stderr}` : "stderr: <empty>",
        completed.error ? `error: ${completed.error.message}` : "",
        "",
      ].filter(Boolean).join("\n"),
      "utf8",
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    appendFileSync(logFile, `${new Date().toISOString()} [${adapter.id}] [WARN] WSL2 stop hook failed: ${message}\n`, "utf8");
  }
}

export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}
