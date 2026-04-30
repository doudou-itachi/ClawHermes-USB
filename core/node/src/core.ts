import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { get } from "node:http";
import { createHash } from "node:crypto";
import type { AdapterDescriptor, EnvFileDiagnostic, EnvInitResult, PathDiagnostic, PortDiagnostic, RuntimeDiagnostic, RuntimeInstallResult, RuntimeManifest, RuntimePreparationStep, ServiceEnvironment, ServiceEnvironmentDiagnostic, ServiceEnvFileResult, ServiceStatus } from "./types";
import { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";
import { dataWritable, getRoot, portableEnv, resolveRelative, writeLog } from "./portable";

export { dataWritable, getRoot, portableEnv } from "./portable";
export { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";

export const PORTAL_URL = "http://127.0.0.1:17000/";

export function runtimeDiagnostics(usbRoot: string): RuntimeDiagnostic[] {
  const root = getRoot(usbRoot);
  const manifest = loadRuntimeManifest(root);
  return manifest.runtimes.map((runtime) => {
    const resolvedCandidates = runtime.candidates.map((candidate) => resolveRelative(root, candidate));
    const foundPath = resolvedCandidates.find((candidate) => existsSync(candidate)) ?? resolvedCandidates[0];
    return {
      name: runtime.name,
      label: runtime.label,
      path: foundPath,
      found: resolvedCandidates.some((candidate) => existsSync(candidate)),
      versionPolicy: runtime.versionPolicy,
      packageType: runtime.packageType,
      sourceUrl: runtime.sourceUrl,
      installDir: resolveRelative(root, runtime.installDir),
      candidates: resolvedCandidates,
      notes: runtime.notes,
    };
  });
}

export function loadRuntimeManifest(usbRoot: string): RuntimeManifest {
  const manifestPath = join(getRoot(usbRoot), "config", "defaults", "runtimes.json");
  return JSON.parse(readFileSync(manifestPath, "utf8")) as RuntimeManifest;
}

export function runtimePreparationPlan(usbRoot: string) {
  const root = getRoot(usbRoot);
  const manifest = loadRuntimeManifest(root);
  const diagnosticsByName = new Map(runtimeDiagnostics(root).map((runtime) => [runtime.name, runtime]));
  const steps: RuntimePreparationStep[] = manifest.runtimes.map((runtime) => {
    const diagnostic = diagnosticsByName.get(runtime.name);
    return {
      name: runtime.name,
      label: runtime.label,
      action: "extract",
      versionPolicy: runtime.versionPolicy,
      packageType: runtime.packageType,
      sourceUrl: runtime.sourceUrl,
      installDir: resolveRelative(root, runtime.installDir),
      expectedExecutables: runtime.candidates.map((candidate) => resolveRelative(root, candidate)),
      notes: runtime.notes,
      found: diagnostic?.found === true,
    };
  });
  const messages = steps.map((step) => {
    if (step.found) {
      return `${step.label} already present under ${step.installDir}.`;
    }
    return `Download ${step.label} from ${step.sourceUrl}, then extract it into ${step.installDir}. Expected executable: ${step.expectedExecutables[0]}.`;
  });
  return {
    root,
    platform: manifest.platform,
    steps,
    messages,
  };
}

export function installRuntimeFromArchive(usbRoot: string, runtimeName: string, archivePath: string, dryRun: boolean, expectedSha256?: string): RuntimeInstallResult {
  const root = getRoot(usbRoot);
  const manifest = loadRuntimeManifest(root);
  const runtime = manifest.runtimes.find((item) => item.name === runtimeName);
  if (!runtime) {
    throw new Error(`Unknown runtime: ${runtimeName}`);
  }
  const archive = resolve(archivePath);
  if (!existsSync(archive)) {
    throw new Error(`Runtime archive not found: ${archive}`);
  }
  if (!archive.toLowerCase().endsWith(".zip")) {
    throw new Error(`Only .zip runtime archives are supported right now: ${archive}`);
  }
  const actualSha256 = sha256File(archive);
  if (expectedSha256 && actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`SHA256 mismatch for ${archive}. Expected ${expectedSha256}, got ${actualSha256}.`);
  }
  const installDir = resolveRelative(root, runtime.installDir);
  const expectedExecutables = runtime.candidates.map((candidate) => resolveRelative(root, candidate));

  if (!dryRun) {
    mkdirSync(installDir, { recursive: true });
    const tempDir = join(root, "data", "tmp", "runtime-extract", `${runtime.name}-${Date.now()}`);
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
    try {
      execFileSync("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive",
        "-LiteralPath",
        archive,
        "-DestinationPath",
        tempDir,
        "-Force",
      ], { stdio: "ignore" });
      copyExtractedRuntime(tempDir, installDir);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const installed = expectedExecutables.some((candidate) => existsSync(candidate));
  return {
    runtime: runtime.name,
    dryRun,
    archive,
    installDir,
    expectedExecutables,
    sha256: expectedSha256 ?? null,
    checksumVerified: expectedSha256 ? true : null,
    wouldExtract: true,
    installed,
    message: dryRun
      ? `Would extract ${archive} into ${installDir}.`
      : installed
        ? `Installed ${runtime.label} into ${installDir}.`
        : `Extracted ${archive}, but no expected executable was found under ${installDir}.`,
  };
}

function sha256File(file: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(file));
  return hash.digest("hex");
}

function copyExtractedRuntime(sourceDir: string, installDir: string): void {
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  const contentRoot = entries.length === 1 && entries[0]?.isDirectory()
    ? join(sourceDir, entries[0].name)
    : sourceDir;
  copyDirectoryContents(contentRoot, installDir);
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(source, target);
    } else if (entry.isFile()) {
      writeFileSync(target, readFileSync(source));
    }
  }
}

export function setupDiagnostics(usbRoot: string) {
  const root = getRoot(usbRoot);
  const adapters = loadAdapters(root);
  const knownIds = adapters.map((adapter) => adapter.id);
  const adapterResults = adapters.map((adapter) => validateAdapter(adapter, knownIds));
  const runtimes = runtimeDiagnostics(root);
  const readiness = integrationReadiness(adapters);
  const ports = portDiagnostics(root);
  const paths = pathDiagnostics(root);
  const envFiles = envFileDiagnostics(root, adapters);
  const writable = dataWritable(root);
  const messages: string[] = [];

  for (const runtime of runtimes) {
    if (!runtime.found) messages.push(`${runtime.label} not found at ${runtime.path}.`);
  }
  for (const adapter of adapterResults) {
    for (const error of adapter.errors) messages.push(`Adapter ${adapter.id}: ${error}`);
  }
  for (const item of readiness) {
    if (!item.productionReady) messages.push(`Adapter ${item.id} integration is not production-ready: ${item.summary}`);
  }
  for (const port of ports) {
    if (!port.available) messages.push(`Port ${port.port} is already in use for ${port.name}. Stop the conflicting process or change config/defaults/ports.json.`);
  }
  for (const path of paths) {
    if (path.required && !path.exists) messages.push(`Required ${path.type} is missing: ${path.path}.`);
  }
  for (const envFile of envFiles) {
    if (!envFile.exists) {
      messages.push(`Env file missing: ${envFile.path}. To configure ${envFile.serviceId}, copy ${envFile.examplePath} to ${envFile.path}.`);
    }
  }
  if (!writable) messages.push("Data directory is not writable.");

  return { root, adapters: adapterResults, runtimes, readiness, ports, paths, envFiles, dataWritable: writable, messages };
}

export function envFileDiagnostics(usbRoot: string, adapters: AdapterDescriptor[]): EnvFileDiagnostic[] {
  const root = getRoot(usbRoot);
  const diagnostics: EnvFileDiagnostic[] = [];
  const seen = new Set<string>();
  for (const adapter of adapters) {
    for (const envFile of adapter.env?.files ?? []) {
      const key = `${adapter.id}:${envFile}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const examplePath = `${envFile}.example`;
      diagnostics.push({
        serviceId: adapter.id,
        path: envFile,
        exists: existsSync(resolveRelative(root, envFile)),
        examplePath,
        exampleExists: existsSync(resolveRelative(root, examplePath)),
      });
    }
  }
  return diagnostics.sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.path.localeCompare(b.path));
}

export function initializeEnvFiles(usbRoot: string, dryRun: boolean): EnvInitResult {
  const root = getRoot(usbRoot);
  const diagnostics = envFileDiagnostics(root, loadAdapters(root));
  const result: EnvInitResult = {
    root,
    dryRun,
    files: [],
    created: [],
    skipped: [],
    messages: [],
  };

  for (const envFile of diagnostics) {
    if (envFile.exists) {
      result.files.push({ ...envFile, action: "skipped", reason: "exists" });
      result.skipped.push({
        serviceId: envFile.serviceId,
        path: envFile.path,
        examplePath: envFile.examplePath,
        reason: "exists",
      });
      result.messages.push(`Skipped existing env file: ${envFile.path}.`);
      continue;
    }

    if (!envFile.exampleExists) {
      result.files.push({ ...envFile, action: "skipped", reason: "missing-example" });
      result.skipped.push({
        serviceId: envFile.serviceId,
        path: envFile.path,
        examplePath: envFile.examplePath,
        reason: "missing-example",
      });
      result.messages.push(`Cannot create ${envFile.path}; template is missing: ${envFile.examplePath}.`);
      continue;
    }

    result.created.push(envFile.path);
    if (dryRun) {
      result.files.push({ ...envFile, action: "would-create", reason: null });
      result.messages.push(`Would create ${envFile.path} from ${envFile.examplePath}.`);
      continue;
    }

    const target = resolveRelative(root, envFile.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolveRelative(root, envFile.examplePath), target);
    result.files.push({ ...envFile, action: "created", reason: null });
    result.messages.push(`Created ${envFile.path} from ${envFile.examplePath}.`);
  }

  return result;
}

export function resolveServiceEnvironment(usbRoot: string, serviceId: string): ServiceEnvironment {
  const root = getRoot(usbRoot);
  const adapter = loadAdapters(root).find((item) => item.id === serviceId);
  if (!adapter) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  const env: Record<string, string> = { ...portableEnv(root) };
  const files: ServiceEnvFileResult[] = [];
  const messages: string[] = [];

  for (const envPath of adapter.env?.files ?? []) {
    const absolutePath = resolveRelative(root, envPath);
    if (!existsSync(absolutePath)) {
      files.push({ path: envPath, exists: false, loaded: false, variables: [], errors: [] });
      messages.push(`Env file missing: ${envPath}.`);
      continue;
    }

    const parsed = parseEnvFile(absolutePath);
    Object.assign(env, parsed.variables);
    files.push({
      path: envPath,
      exists: true,
      loaded: parsed.errors.length === 0,
      variables: Object.keys(parsed.variables).sort(),
      errors: parsed.errors,
    });
    if (parsed.errors.length === 0) {
      messages.push(`Loaded env file: ${envPath}.`);
    } else {
      messages.push(`Loaded env file with ${parsed.errors.length} parse issue(s): ${envPath}.`);
    }
  }

  for (const [name, value] of Object.entries(adapter.env?.variables ?? {})) {
    env[name] = expandEnvTemplate(value, env);
  }

  return { root, serviceId: adapter.id, env, files, messages };
}

export function serviceEnvironmentDiagnostic(usbRoot: string, serviceId: string): ServiceEnvironmentDiagnostic {
  const resolved = resolveServiceEnvironment(usbRoot, serviceId);
  return {
    root: resolved.root,
    serviceId: resolved.serviceId,
    files: resolved.files,
    variables: Object.keys(resolved.env).sort(),
    messages: resolved.messages,
  };
}

export function readLogTail(usbRoot: string, target: string, requestedLines: number) {
  const root = getRoot(usbRoot);
  const lineCount = Math.max(1, Math.min(Number.isFinite(requestedLines) ? Math.floor(requestedLines) : 50, 200));
  const logPath = resolveLogTarget(root, target);
  const exists = existsSync(logPath);
  const lines = exists
    ? readFileSync(logPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).slice(-lineCount)
    : [];
  return {
    root,
    target,
    path: logPath,
    exists,
    requestedLines: lineCount,
    lines,
  };
}

function resolveLogTarget(usbRoot: string, target: string): string {
  const root = getRoot(usbRoot);
  if (target === "launcher") return join(root, "data", "logs", "launcher.log");
  const adapter = loadAdapters(root).find((item) => item.id === target);
  if (!adapter) throw new Error(`Unknown log target: ${target}`);
  return resolveRelative(root, adapter.logFile);
}

function parseEnvFile(file: string): { variables: Record<string, string>; errors: string[] } {
  const variables: Record<string, string> = {};
  const errors: string[] = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`Line ${index + 1}: expected KEY=value.`);
      continue;
    }
    variables[match[1]] = unquoteEnvValue(match[2].trim());
  }
  return { variables, errors };
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function expandEnvTemplate(value: string, env: Record<string, string>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name: string) => env[name] ?? match);
}

export function pathDiagnostics(usbRoot: string): PathDiagnostic[] {
  const root = getRoot(usbRoot);
  const required: Array<{ path: string; type: "directory" | "file" }> = [
    { path: "adapters", type: "directory" },
    { path: "apps/openclaw", type: "directory" },
    { path: "apps/hermes-agent", type: "directory" },
    { path: "apps/hermes-web-ui", type: "directory" },
    { path: "config/defaults/ports.json", type: "file" },
    { path: "config/defaults/services.json", type: "file" },
    { path: "config/defaults/runtimes.json", type: "file" },
    { path: "data/logs", type: "directory" },
    { path: "data/tmp", type: "directory" },
    { path: "portal", type: "directory" },
  ];
  return required.map((item) => {
    const absolute = resolveRelative(root, item.path);
    const exists = existsSync(absolute);
    return {
      path: item.path,
      type: item.type,
      required: true,
      exists: exists && (item.type === "file" ? !isDirectory(absolute) : isDirectory(absolute)),
    };
  });
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function portDiagnostics(usbRoot: string): PortDiagnostic[] {
  const root = getRoot(usbRoot);
  const configPath = join(root, "config", "defaults", "ports.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const diagnostics: PortDiagnostic[] = [];
  for (const [name, value] of Object.entries(config)) {
    if (typeof value === "number") {
      diagnostics.push({
        name,
        host: "127.0.0.1",
        port: value,
        available: isTcpPortAvailableSync(value),
      });
    }
  }
  return diagnostics;
}

function isTcpPortAvailableSync(port: number): boolean {
  try {
    const output = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `$client = [System.Net.Sockets.TcpClient]::new(); $async = $client.BeginConnect('127.0.0.1', ${port}, $null, $null); if ($async.AsyncWaitHandle.WaitOne(200)) { try { $client.EndConnect($async); 'true' } catch { 'false' } } else { 'false' }; $client.Close()`,
    ], { encoding: "utf8", timeout: 3000 }).trim();
    return output.toLowerCase() !== "true";
  } catch {
    return true;
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function generatePortal(usbRoot: string): { path: string; url: string } {
  const root = getRoot(usbRoot);
  const portalPath = join(root, "portal", "index.html");
  mkdirSync(dirname(portalPath), { recursive: true });
  const rows = getStatus(root).services.map((service) => {
    const logPath = service.logFile.startsWith(root)
      ? service.logFile.slice(root.length).replace(new RegExp(`^\\${sep}`), "").replaceAll("\\", "/")
      : service.logFile;
    const url = service.portalUrl ? `<a href="${escapeHtml(service.portalUrl)}">${escapeHtml(service.portalUrl)}</a>` : "<span>Pending upstream URL</span>";
    const healthLabel = service.health.ready ? "Ready" : "Not ready";
    const health = `<span data-health-label>${escapeHtml(healthLabel)}</span> <span data-health-type>(${escapeHtml(service.health.type)})</span><br><small data-health-reason>${escapeHtml(service.health.reason)}</small>`;
    return `<tr data-service-id="${escapeHtml(service.id)}"><td>${escapeHtml(service.displayName)}</td><td>${escapeHtml(service.id)}</td><td data-status-cell>${escapeHtml(service.status)}</td><td>${health}</td><td>${url}</td><td><code>${escapeHtml(logPath)}</code></td></tr>`;
  }).join("\n          ");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClawHermes-USB Portal</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #202124; background: #f7f8fa; }
    main { max-width: 1080px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 16px; }
    section { margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #d8dde6; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #eef2f7; }
    code { font-family: Consolas, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>ClawHermes-USB Portal</h1>
    <section>
      <p><strong>Project root:</strong> <code>${escapeHtml(root)}</code></p>
      <p><strong>Data root:</strong> <code>${escapeHtml(join(root, "data"))}</code></p>
      <p><strong>Generated:</strong> <code>${new Date().toISOString()}</code></p>
    </section>
    <section>
      <h2>Services</h2>
      <table>
        <thead><tr><th>Service</th><th>ID</th><th>Status</th><th>Health</th><th>URL</th><th>Log</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Operations</h2>
      <p>Use <code>launcher/windows/Status.bat</code> to refresh service state and <code>launcher/windows/Stop.bat</code> to stop placeholder services.</p>
    </section>
  </main>
  <script>
    async function refreshStatus() {
      try {
        const response = await fetch('/status.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        for (const service of payload.services || []) {
          const row = document.querySelector('[data-service-id="' + service.id + '"]');
          if (!row) continue;
          const statusCell = row.querySelector('[data-status-cell]');
          const healthLabel = row.querySelector('[data-health-label]');
          const healthType = row.querySelector('[data-health-type]');
          const healthReason = row.querySelector('[data-health-reason]');
          if (statusCell) statusCell.textContent = service.status || 'unknown';
          if (healthLabel) healthLabel.textContent = service.health && service.health.ready ? 'Ready' : 'Not ready';
          if (healthType) healthType.textContent = '(' + ((service.health && service.health.type) || 'unknown') + ')';
          if (healthReason) healthReason.textContent = (service.health && service.health.reason) || '';
        }
      } catch {
        // Keep the last rendered status visible when refresh fails.
      }
    }
    refreshStatus();
    window.setInterval(refreshStatus, 5000);
  </script>
</body>
</html>
`;
  writeFileSync(portalPath, html, "utf8");
  writeLog(root, "portal", "INFO", "Generated portal/index.html.");
  return { path: portalPath, url: PORTAL_URL };
}

function portalPidFile(usbRoot: string): string {
  return join(getRoot(usbRoot), "data", "tmp", "pids", "portal.pid");
}

function portalServerPath(usbRoot: string): string {
  return join(getRoot(usbRoot), "core", "node", "dist", "portal-server.js");
}

function portalProcesses(usbRoot: string): Array<{ ProcessId: number; CommandLine: string }> {
  const root = getRoot(usbRoot);
  try {
    const output = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*portal-server.js*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
    ], { encoding: "utf8" }).trim();
    if (!output) return [];
    const parsed = JSON.parse(output) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter((row): row is { ProcessId: number; CommandLine: string } => {
      const item = row as { ProcessId?: number; CommandLine?: string };
      return (
        typeof item.ProcessId === "number" &&
        typeof item.CommandLine === "string" &&
        /\bnode(?:\.exe)?\b/i.test(item.CommandLine) &&
        item.CommandLine.includes("portal-server.js") &&
        item.CommandLine.includes(root)
      );
    });
  } catch {
    return [];
  }
}

function portalProcessById(usbRoot: string, pid: number): { ProcessId: number; CommandLine: string } | null {
  return portalProcesses(usbRoot).find((processInfo) => processInfo.ProcessId === pid) ?? null;
}

async function tcpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => resolveAvailable(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
  });
}

async function portalReady(timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolveReady) => {
      const request = get(PORTAL_URL, (response) => {
        response.resume();
        resolveReady(response.statusCode === 200);
      });
      request.setTimeout(500, () => {
        request.destroy();
        resolveReady(false);
      });
      request.on("error", () => resolveReady(false));
    });
    if (ready) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return false;
}

function portalMetadata(root: string, processId: number) {
  return {
    serviceId: "portal",
    displayName: "Portal",
    status: "running",
    processId,
    startedAt: new Date().toISOString(),
    url: PORTAL_URL,
    logFile: join(root, "data", "logs", "portal.log"),
  };
}

export async function startPortalServer(usbRoot: string) {
  const root = getRoot(usbRoot);
  const pidFile = portalPidFile(root);
  mkdirSync(dirname(pidFile), { recursive: true });
  if (existsSync(pidFile)) {
    const existing = JSON.parse(readFileSync(pidFile, "utf8")) as { processId?: number };
    if (existing.processId && portalProcessById(root, existing.processId)) return existing;
    rmSync(pidFile, { force: true });
  }
  const existingProcess = portalProcesses(root)[0];
  if (existingProcess) {
    const metadata = portalMetadata(root, existingProcess.ProcessId);
    writeFileSync(pidFile, JSON.stringify(metadata, null, 2), "utf8");
    writeLog(root, "portal", "INFO", "Reused existing portal server on http://127.0.0.1:17000/.");
    return metadata;
  }
  if (!(await tcpPortAvailable(17000))) {
    throw new Error("Port 17000 is already in use. Stop the conflicting process or change config/defaults/ports.json.");
  }
  const child = spawn(process.execPath, [portalServerPath(root), "--usb-root", root, "--port", "17000"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  if (!(await portalReady())) {
    if (child.pid && portalProcessById(root, child.pid)) process.kill(child.pid);
    throw new Error("Portal server did not become reachable at http://127.0.0.1:17000/.");
  }
  const metadata = portalMetadata(root, child.pid ?? 0);
  writeFileSync(pidFile, JSON.stringify(metadata, null, 2), "utf8");
  writeLog(root, "portal", "INFO", "Started portal server on http://127.0.0.1:17000/.");
  return metadata;
}

export function getPortalStatus(usbRoot: string): ServiceStatus {
  const root = getRoot(usbRoot);
  const pidFile = portalPidFile(root);
  let status = "stopped";
  let processId: number | null = null;
  if (existsSync(pidFile)) {
    const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { processId?: number };
    if (metadata.processId && portalProcessById(root, metadata.processId)) {
      status = "running";
      processId = metadata.processId;
    } else if (portalProcesses(root).length > 0) {
      status = "running";
      processId = portalProcesses(root)[0]?.ProcessId ?? null;
    } else {
      rmSync(pidFile, { force: true });
      status = "stopped";
    }
  } else if (portalProcesses(root).length > 0) {
    status = "running";
    processId = portalProcesses(root)[0]?.ProcessId ?? null;
  }
  return {
    id: "portal",
    displayName: "Portal",
    status,
    pidFile,
    logFile: join(root, "data", "logs", "portal.log"),
    portalUrl: PORTAL_URL,
    processId,
    placeholder: false,
    health: {
      type: "http",
      ready: status === "running",
      reason: status === "running" ? "Portal HTTP server is running." : "Portal HTTP server is stopped.",
    },
  };
}

export function stopPortalServer(usbRoot: string): boolean {
  const root = getRoot(usbRoot);
  const pidFile = portalPidFile(root);
  let stopped = false;
  if (existsSync(pidFile)) {
    const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { processId?: number };
    if (metadata.processId && portalProcessById(root, metadata.processId)) {
      killProcessTree(metadata.processId);
      stopped = true;
    }
    rmSync(pidFile, { force: true });
  }
  for (const processInfo of portalProcesses(root)) {
    try {
      killProcessTree(processInfo.ProcessId);
      stopped = true;
    } catch {
      // Already gone.
    }
  }
  if (stopped) writeLog(root, "portal", "INFO", "Stopped portal server.");
  return stopped;
}

function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}

export async function startSkeleton(usbRoot: string) {
  const root = getRoot(usbRoot);
  const setup = setupDiagnostics(root);
  const started: string[] = [];
  for (const adapter of serviceOrder(root, "start").filter((item) => item.enabled)) {
    const pidFile = resolveRelative(root, adapter.pidFile);
    const logFile = resolveRelative(root, adapter.logFile);
    const serviceEnv = resolveServiceEnvironment(root, adapter.id);
    mkdirSync(dirname(pidFile), { recursive: true });
    mkdirSync(dirname(logFile), { recursive: true });
    const metadata = shouldLaunchManagedProcess(adapter)
      ? launchManagedAdapterProcess(root, adapter, serviceEnv)
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
    started.push(adapter.id);
  }
  generatePortal(root);
  const portal = await startPortalServer(root);
  writeStatusSnapshot(root, getStatus(root));
  return { root, started, portal, setupMessages: setup.messages };
}

function shouldLaunchManagedProcess(adapter: AdapterDescriptor): boolean {
  return adapter.integration?.productionReady === true && Boolean(adapter.commands.start);
}

function environmentMetadata(serviceEnv: ServiceEnvironment) {
  return {
    files: serviceEnv.files,
    variables: Object.keys(serviceEnv.env).sort(),
  };
}

function launchManagedAdapterProcess(root: string, adapter: AdapterDescriptor, serviceEnv: ServiceEnvironment) {
  const command = adapter.commands.start;
  if (!command) throw new Error(`Adapter ${adapter.id} has no start command.`);
  const workingDirectory = resolveRelative(root, adapter.appDir);
  const logFile = resolveRelative(root, adapter.logFile);
  const logFd = openSync(logFile, "a");
  try {
    const child = spawn(command, {
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
      command,
      workingDirectory,
      logFile,
      environment: environmentMetadata(serviceEnv),
      placeholder: false,
    };
  } finally {
    closeSync(logFd);
  }
}

export function getStatus(usbRoot: string) {
  const root = getRoot(usbRoot);
  const services: ServiceStatus[] = serviceOrder(root, "start").map((adapter) => {
    const pidFile = resolveRelative(root, adapter.pidFile);
    let status = "stopped";
    let processId: number | null = null;
    let placeholder: boolean | null = null;
    if (existsSync(pidFile)) {
      const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { status?: string; placeholder?: boolean; processId?: number };
      if (metadata.placeholder === false && metadata.processId && !processExists(metadata.processId)) {
        rmSync(pidFile, { force: true });
        status = "stopped";
      } else {
        status = metadata.status ?? "unknown";
        processId = metadata.placeholder === false ? metadata.processId ?? null : null;
        placeholder = metadata.placeholder ?? null;
      }
    }
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      status,
      pidFile,
      logFile: resolveRelative(root, adapter.logFile),
      portalUrl: adapter.portal?.url ?? null,
      processId,
      placeholder,
      health: adapterHealth(adapter, status, placeholder),
    };
  });
  services.push(getPortalStatus(root));
  return { root, generatedAt: new Date().toISOString(), services };
}

export function writeStatusSnapshot(usbRoot: string, status: ReturnType<typeof getStatus>): string {
  const root = getRoot(usbRoot);
  const snapshotPath = join(root, "data", "tmp", "status.json");
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  return snapshotPath;
}

function adapterHealth(adapter: AdapterDescriptor, status: string, placeholder: boolean | null) {
  const type = typeof adapter.health?.type === "string" ? adapter.health.type : "unknown";
  const url = typeof adapter.health?.url === "string" ? adapter.health.url : null;
  if (status === "stopped") {
    return { type, ready: false, reason: "Service is stopped.", ...(url ? { url, statusCode: null } : {}) };
  }
  if (placeholder === true) {
    return { type, ready: false, reason: "Placeholder metadata is present, but no real process was launched.", ...(url ? { url, statusCode: null } : {}) };
  }
  if (type === "http") return httpAdapterHealth(adapter);
  if (type === "process" && status === "running") {
    return { type, ready: true, reason: "Managed process is running." };
  }
  return {
    type,
    ready: status === "running",
    reason: status === "running" ? "Service reports running." : `Service status is ${status}.`,
  };
}

function httpAdapterHealth(adapter: AdapterDescriptor) {
  const url = typeof adapter.health?.url === "string" ? adapter.health.url : null;
  if (!url) {
    return { type: "http", ready: false, reason: "HTTP health URL is not configured.", url: null, statusCode: null };
  }
  const timeoutSeconds = typeof adapter.health?.timeoutSeconds === "number" ? adapter.health.timeoutSeconds : 2;
  const probe = probeHttpHealth(url, timeoutSeconds);
  return {
    type: "http",
    ready: probe.ready,
    reason: probe.reason,
    url,
    statusCode: probe.statusCode,
  };
}

function probeHttpHealth(url: string, timeoutSeconds: number): { ready: boolean; statusCode: number | null; reason: string } {
  const timeoutMs = Math.max(1, Math.min(timeoutSeconds, 10)) * 1000;
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    `$timeoutMs = ${timeoutMs}`,
    `$request = [System.Net.WebRequest]::Create('${escapePowerShellSingleQuoted(url)}')`,
    "$request.Method = 'GET'",
    "$request.Timeout = $timeoutMs",
    "try {",
    "  $response = $request.GetResponse()",
    "  [pscustomobject]@{ ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400); statusCode = [int]$response.StatusCode; error = $null } | ConvertTo-Json -Compress",
    "} catch {",
    "  $statusCode = $null",
    "  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }",
    "  [pscustomobject]@{ ok = $false; statusCode = $statusCode; error = $_.Exception.Message } | ConvertTo-Json -Compress",
    "} finally {",
    "  if ($response) { $response.Close() }",
    "}",
  ].join("; ");
  try {
    const output = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: timeoutMs + 1000 }).trim();
    const parsed = JSON.parse(output) as { ok?: boolean; statusCode?: number | null; error?: string | null };
    if (parsed.ok === true) {
      return { ready: true, statusCode: parsed.statusCode ?? null, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
    }
    if (typeof parsed.statusCode === "number") {
      return { ready: false, statusCode: parsed.statusCode, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
    }
    return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${parsed.error ?? "request failed"}.` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${message}.` };
  }
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replaceAll("'", "''");
}

function processExists(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    return code === "EPERM";
  }
}

export function stopSkeleton(usbRoot: string) {
  const root = getRoot(usbRoot);
  const stopped: string[] = [];
  if (stopPortalServer(root)) stopped.push("portal");
  for (const adapter of serviceOrder(root, "stop")) {
    const pidFile = resolveRelative(root, adapter.pidFile);
    if (existsSync(pidFile)) {
      const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { placeholder?: boolean; processId?: number };
      if (metadata.placeholder === false && metadata.processId) {
        try {
          killProcessTree(metadata.processId);
        } catch {
          // Already gone.
        }
      }
      rmSync(pidFile, { force: true });
      writeLog(root, adapter.id, "INFO", metadata.placeholder === false ? "Stopped managed service." : "Stopped placeholder service.");
      stopped.push(adapter.id);
    }
  }
  return { root, stopped };
}
