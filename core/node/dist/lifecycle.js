"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAdapter = startAdapter;
exports.stopAdapter = stopAdapter;
exports.killProcessTree = killProcessTree;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
const wsl_adapter_1 = require("./wsl-adapter");
const wsl_1 = require("./wsl");
const command_template_1 = require("./command-template");
const skills_1 = require("./skills");
const WEIXIN_PLUGIN_RELATIVE_DIR = (0, node_path_1.join)("apps", "openclaw", "node_modules", "@tencent-weixin", "openclaw-weixin");
const WEIXIN_PLUGIN_ID = "openclaw-weixin";
function startAdapter(root, adapter, options = {}) {
    const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
    const logFile = (0, portable_1.resolveRelative)(root, adapter.logFile);
    const serviceEnv = options.serviceEnv ?? (0, environment_1.resolveServiceEnvironment)(root, adapter.id);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pidFile), { recursive: true });
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
    const existingMetadata = readReusableStartMetadata(pidFile);
    if (existingMetadata) {
        (0, portable_1.writeLog)(root, adapter.id, "INFO", `Reused existing ${adapter.id} service metadata.`);
        return existingMetadata;
    }
    const metadata = shouldLaunchManagedProcess(root, adapter, options.forceManaged === true)
        ? launchManagedAdapterProcess(root, adapter, serviceEnv, options.processPlan, options.attachToParent === true)
        : {
            serviceId: adapter.id,
            displayName: adapter.displayName,
            status: "placeholder-started",
            startedAt: new Date().toISOString(),
            command: adapter.commands.start ?? null,
            workingDirectory: (0, portable_1.resolveRelative)(root, adapter.appDir),
            logFile,
            environment: environmentMetadata(serviceEnv),
            placeholder: true,
        };
    (0, node_fs_1.writeFileSync)(pidFile, JSON.stringify(metadata, null, 2), "utf8");
    if (metadata.placeholder) {
        (0, node_fs_1.appendFileSync)(logFile, `${new Date().toISOString()} [${adapter.id}] [INFO] Placeholder service started.\n`);
        (0, portable_1.writeLog)(root, adapter.id, "INFO", "Started placeholder service.");
    }
    else if ("processId" in metadata) {
        (0, portable_1.writeLog)(root, adapter.id, "INFO", `Started managed service process ${metadata.processId}.`);
    }
    return metadata;
}
function readReusableStartMetadata(pidFile) {
    if (!(0, node_fs_1.existsSync)(pidFile))
        return null;
    try {
        const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (metadata.placeholder === true)
            return metadata;
        if (metadata.placeholder === false && typeof metadata.processId === "number" && processExists(metadata.processId)) {
            return metadata;
        }
    }
    catch {
        // Corrupt pid files are treated as stale and replaced by a fresh launch.
    }
    (0, node_fs_1.rmSync)(pidFile, { force: true });
    return null;
}
function shouldLaunchManagedProcess(root, adapter, forceManaged) {
    return (forceManaged || adapter.integration?.productionReady === true) && Boolean(adapter.commands.start) && appDirHasRealContent(root, adapter);
}
function appDirHasRealContent(root, adapter) {
    const appDir = (0, portable_1.resolveRelative)(root, adapter.appDir);
    try {
        return (0, node_fs_1.existsSync)(appDir) && (0, node_fs_1.readdirSync)(appDir).some((entry) => entry !== ".gitkeep");
    }
    catch {
        return false;
    }
}
function environmentMetadata(serviceEnv) {
    return {
        files: serviceEnv.files,
        variables: Object.keys(serviceEnv.env).sort(),
    };
}
function launchManagedAdapterProcess(root, adapter, serviceEnv, processPlan, attachToParent = false) {
    const commandTemplate = adapter.commands.start;
    if (!commandTemplate)
        throw new Error(`Adapter ${adapter.id} has no start command.`);
    prepareManagedServiceEnvironment(root, adapter, serviceEnv);
    const command = (0, command_template_1.expandCommandTemplate)(commandTemplate, serviceEnv.env);
    const workingDirectory = (0, portable_1.resolveRelative)(root, adapter.appDir);
    const logFile = (0, portable_1.resolveRelative)(root, adapter.logFile);
    const logFd = (0, node_fs_1.openSync)(logFile, "a");
    const serviceStdio = process.platform === "win32" ? "ignore" : ["ignore", logFd, logFd];
    const serviceDetached = !(process.platform === "win32" && attachToParent);
    try {
        const nativePlan = processPlan ? null : nativeManagedProcessPlan(command);
        const child = processPlan
            ? (0, node_child_process_1.spawn)(processPlan.executablePath, processPlan.args, {
                cwd: processPlan.workingDirectory,
                env: { ...process.env, ...(processPlan.env ?? {}) },
                detached: serviceDetached,
                shell: false,
                stdio: serviceStdio,
                windowsHide: true,
            })
            : nativePlan
                ? (0, node_child_process_1.spawn)(nativePlan.executablePath, nativePlan.args, {
                    cwd: workingDirectory,
                    env: { ...process.env, ...serviceEnv.env },
                    detached: serviceDetached,
                    shell: false,
                    stdio: serviceStdio,
                    windowsHide: true,
                })
                : process.platform === "win32"
                    ? throwShellManagedCommandError(adapter.id, command)
                    : (0, node_child_process_1.spawn)(command, {
                        cwd: workingDirectory,
                        env: { ...process.env, ...serviceEnv.env },
                        detached: serviceDetached,
                        shell: true,
                        stdio: serviceStdio,
                        windowsHide: true,
                    });
        child.on("error", (error) => {
            (0, node_fs_1.appendFileSync)(logFile, `${new Date().toISOString()} [${adapter.id}] [ERROR] Managed service spawn failed: ${error.message}\n`, "utf8");
        });
        if (!child.pid || child.pid <= 0) {
            if (child.pid && child.pid > 0)
                child.kill();
            throw new Error(`Adapter ${adapter.id} managed service did not expose a valid process id.`);
        }
        child.unref();
        return {
            serviceId: adapter.id,
            displayName: adapter.displayName,
            status: "running",
            processId: child.pid,
            startedAt: new Date().toISOString(),
            command: processPlan?.command ?? command,
            workingDirectory: processPlan?.workingDirectory ?? workingDirectory,
            logFile,
            environment: environmentMetadata(serviceEnv),
            placeholder: false,
            ...(processPlan?.runner ? { runner: processPlan.runner } : {}),
            ...(processPlan?.metadata ?? {}),
        };
    }
    finally {
        (0, node_fs_1.closeSync)(logFd);
    }
}
function throwShellManagedCommandError(serviceId, command) {
    throw new Error(`Adapter ${serviceId} start command cannot be launched without a shell on Windows: ${command}. ` +
        "Use a simple executable-plus-arguments command so ClawHermes can start it without opening cmd.exe.");
}
function prepareManagedServiceEnvironment(root, adapter, serviceEnv) {
    ensureHermesConfigFile(serviceEnv);
    if (adapter.id === "openclaw") {
        prepareOpenClawEnvironment(root, serviceEnv);
    }
    if (adapter.id === "hermes-web-ui") {
        prepareHermesWebUiEnvironment(root, serviceEnv);
    }
}
function ensureHermesConfigFile(serviceEnv) {
    const hermesHome = serviceEnv.env.HERMES_HOME;
    if (!hermesHome)
        return;
    const profileDir = activeHermesProfileDir(hermesHome);
    (0, node_fs_1.mkdirSync)(profileDir, { recursive: true });
    const configPath = (0, node_path_1.join)(profileDir, "config.yaml");
    if (!(0, node_fs_1.existsSync)(configPath)) {
        (0, node_fs_1.writeFileSync)(configPath, "{}\n", "utf8");
    }
}
function activeHermesProfileDir(hermesHome) {
    const activeProfilePath = (0, node_path_1.join)(hermesHome, "active_profile");
    try {
        const profileName = (0, node_fs_1.readFileSync)(activeProfilePath, "utf8").trim();
        if (profileName && profileName !== "default") {
            const profileDir = (0, node_path_1.join)(hermesHome, "profiles", profileName);
            if ((0, node_fs_1.existsSync)(profileDir))
                return profileDir;
        }
    }
    catch {
        // Missing active_profile means Hermes uses the default profile.
    }
    return hermesHome;
}
function prepareOpenClawEnvironment(root, serviceEnv) {
    const configPath = serviceEnv.env.OPENCLAW_CONFIG_PATH || (0, node_path_1.join)(root, "data", "openclaw", "openclaw.json");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(configPath), { recursive: true });
    const existing = readJsonObject(configPath);
    const gateway = objectValue(existing.gateway);
    const logging = objectValue(existing.logging);
    const skills = objectValue(existing.skills);
    const skillsLoad = objectValue(skills.load);
    const plugins = objectValue(existing.plugins);
    const pluginsLoad = objectValue(plugins.load);
    const pluginsEntries = objectValue(plugins.entries);
    const portableSkillsDir = (0, skills_1.ensurePortableSkillsDir)(root);
    const token = serviceEnv.env.OPENCLAW_GATEWAY_TOKEN || "clawhermes";
    const runtimeLogPath = (0, portable_1.resolveRelative)(root, "data/logs/openclaw-runtime.log");
    const weixinPluginPath = (0, portable_1.resolveRelative)(root, WEIXIN_PLUGIN_RELATIVE_DIR);
    const weixinPluginExists = (0, node_fs_1.existsSync)(weixinPluginPath);
    const pluginPaths = weixinPluginExists
        ? appendUniquePathEntry(removeMatchingPathEntries(pluginsLoad.paths, isWeixinPluginPath), weixinPluginPath)
        : removeMatchingPathEntries(pluginsLoad.paths, isWeixinPluginPath);
    (0, node_fs_1.writeFileSync)(configPath, `${JSON.stringify({
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
        skills: {
            ...skills,
            load: {
                ...skillsLoad,
                extraDirs: appendUniquePathEntry(existingPathEntries(skillsLoad.extraDirs), portableSkillsDir),
            },
        },
        plugins: {
            ...plugins,
            load: {
                ...pluginsLoad,
                paths: pluginPaths,
            },
            entries: {
                ...pluginsEntries,
                ...(weixinPluginExists
                    ? {
                        [WEIXIN_PLUGIN_ID]: {
                            ...objectValue(pluginsEntries[WEIXIN_PLUGIN_ID]),
                            enabled: true,
                        },
                    }
                    : {}),
            },
        },
    }, null, 2)}\n`, "utf8");
}
function readJsonObject(path) {
    try {
        return objectValue(JSON.parse((0, node_fs_1.readFileSync)(path, "utf8")));
    }
    catch {
        return {};
    }
}
function objectValue(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function appendUniquePathEntry(value, pathValue) {
    const entries = Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim().length > 0) : [];
    const normalizedTarget = normalizePathForComparison(pathValue);
    const hasTarget = entries.some((item) => normalizePathForComparison(item) === normalizedTarget);
    return hasTarget ? entries : [...entries, pathValue];
}
function existingPathEntries(value) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string" && item.trim().length > 0 && (0, node_fs_1.existsSync)(item))
        : [];
}
function removeMatchingPathEntries(value, predicate) {
    return Array.isArray(value)
        ? value.filter((item) => typeof item === "string" && item.trim().length > 0 && !predicate(item))
        : [];
}
function isWeixinPluginPath(pathValue) {
    return normalizePathForComparison(pathValue).endsWith(pathSuffixForComparison(WEIXIN_PLUGIN_RELATIVE_DIR));
}
function pathSuffixForComparison(pathValue) {
    return `${pathValue.replace(/[\\/]+/g, "\\").replace(/[\\/]+$/, "").toLowerCase()}`;
}
function normalizePathForComparison(pathValue) {
    try {
        return (0, node_path_1.resolve)(pathValue).replace(/[\\/]+$/, "").toLowerCase();
    }
    catch {
        return pathValue.replace(/[\\/]+$/, "").toLowerCase();
    }
}
function nativeManagedProcessPlan(command) {
    if (/[&|<>]/.test(command))
        return null;
    const parts = splitCommandLine(command);
    if (parts.length === 0)
        return null;
    return { executablePath: parts[0], args: parts.slice(1) };
}
function splitCommandLine(command) {
    const parts = [];
    let current = "";
    let quote = null;
    for (const character of command) {
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
    if (current)
        parts.push(current);
    return parts;
}
function prepareHermesWebUiEnvironment(root, serviceEnv) {
    const home = serviceEnv.env.HOME || (0, node_path_1.join)(root, "data", "home");
    const profileDir = (0, node_path_1.join)(home, ".hermes");
    (0, node_fs_1.mkdirSync)(profileDir, { recursive: true });
    const configPath = (0, node_path_1.join)(profileDir, "config.yaml");
    (0, node_fs_1.writeFileSync)(configPath, hermesWebUiProfileConfig(serviceEnv), "utf8");
    const envPath = (0, node_path_1.join)(profileDir, ".env");
    const apiKey = serviceEnv.env.API_SERVER_KEY || serviceEnv.env.AUTH_TOKEN || "clawhermes";
    if (!(0, node_fs_1.existsSync)(envPath)) {
        (0, node_fs_1.writeFileSync)(envPath, `API_SERVER_KEY=${apiKey}\n`, "utf8");
    }
    else {
        const existing = (0, node_fs_1.readFileSync)(envPath, "utf8");
        if (!/^API_SERVER_KEY\s*=/m.test(existing)) {
            const separator = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
            (0, node_fs_1.appendFileSync)(envPath, `${separator}API_SERVER_KEY=${apiKey}\n`, "utf8");
        }
    }
    const shimDir = (0, node_path_1.join)(root, "data", "tmp", "bin", "hermes-web-ui");
    writeHermesWebUiShim(shimDir);
    const powershell = (0, node_path_1.join)(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    serviceEnv.env.HERMES_BIN = powershell;
    serviceEnv.env.CLAWHERMES_HERMES_WSL_DISTRO = serviceEnv.env.CLAWHERMES_HERMES_WSL_DISTRO || "ClawHermes-Ubuntu";
    serviceEnv.env.PSExecutionPolicyPreference = "Bypass";
    serviceEnv.env.PATH = [shimDir, serviceEnv.env.PATH || process.env.PATH || ""].filter(Boolean).join(";");
}
function hermesWebUiProfileConfig(serviceEnv) {
    const upstream = serviceEnv.env.HERMES_AGENT_API_BASE || serviceEnv.env.UPSTREAM || "http://127.0.0.1:8642";
    let host = "127.0.0.1";
    let port = 8642;
    try {
        const parsed = new URL(upstream);
        host = parsed.hostname || host;
        port = Number(parsed.port) || port;
    }
    catch {
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
function writeHermesWebUiShim(shimDir) {
    (0, node_fs_1.mkdirSync)(shimDir, { recursive: true });
    const commonPath = (0, node_path_1.join)(shimDir, "hermes-wsl-command.ps1");
    (0, node_fs_1.writeFileSync)(commonPath, hermesWslCommandScript(), "utf8");
    for (const command of ["gateway", "logs", "profile", "sessions", "setup"]) {
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(shimDir, `${command}.ps1`), hermesSubcommandScript(command), "utf8");
    }
}
function hermesSubcommandScript(command) {
    return [
        `$env:CLAWHERMES_HERMES_SUBCOMMAND = '${command}'`,
        `& "$PSScriptRoot\\hermes-wsl-command.ps1" @args`,
        "exit $LASTEXITCODE",
        "",
    ].join("\n");
}
function hermesWslCommandScript() {
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
function stopAdapter(root, adapter) {
    const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
    if (!(0, node_fs_1.existsSync)(pidFile)) {
        if (adapter.runtime?.kind === "wsl2" && adapter.commands.stop) {
            runWslStopHook(root, adapter);
            (0, portable_1.writeLog)(root, adapter.id, "INFO", "Ran WSL2 stop hook without a managed pid file.");
            return true;
        }
        return false;
    }
    const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
    if (metadata.placeholder === false && metadata.processId) {
        if (metadata.runner?.startsWith("wsl2") && adapter.commands.stop) {
            runWslStopHook(root, adapter);
        }
        try {
            killProcessTree(metadata.processId);
        }
        catch {
            // Already gone.
        }
    }
    (0, node_fs_1.rmSync)(pidFile, { force: true });
    (0, portable_1.writeLog)(root, adapter.id, "INFO", metadata.placeholder === false ? "Stopped managed service." : "Stopped placeholder service.");
    return true;
}
function runWslStopHook(root, adapter) {
    const logFile = (0, portable_1.resolveRelative)(root, adapter.logFile);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
    try {
        const serviceEnv = (0, environment_1.resolveServiceEnvironment)(root, adapter.id);
        const plan = (0, wsl_adapter_1.wslAdapterCommandPlan)(root, adapter, serviceEnv, "stop");
        const invocation = (0, wsl_1.wslExecutableInvocation)(plan.executablePath, plan.args);
        const completed = (0, node_child_process_1.spawnSync)(invocation.executablePath, invocation.args, {
            cwd: root,
            env: process.env,
            encoding: "utf8",
            timeout: 10000,
            windowsHide: true,
        });
        (0, node_fs_1.appendFileSync)(logFile, [
            `${new Date().toISOString()} [${adapter.id}] [INFO] WSL2 stop hook: ${plan.script}`,
            `exitCode: ${completed.status ?? "unknown"}`,
            completed.stdout ? `stdout:\n${completed.stdout}` : "stdout: <empty>",
            completed.stderr ? `stderr:\n${completed.stderr}` : "stderr: <empty>",
            completed.error ? `error: ${completed.error.message}` : "",
            "",
        ].filter(Boolean).join("\n"), "utf8");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        (0, node_fs_1.appendFileSync)(logFile, `${new Date().toISOString()} [${adapter.id}] [WARN] WSL2 stop hook failed: ${message}\n`, "utf8");
    }
}
function killProcessTree(pid) {
    if (!Number.isInteger(pid) || pid <= 0) {
        throw new Error(`Cannot stop managed service with invalid process id ${pid}.`);
    }
    if (process.platform === "win32") {
        (0, node_child_process_1.execFileSync)("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        waitForProcessExit(pid);
    }
    else {
        try {
            process.kill(-pid, "SIGTERM");
        }
        catch {
            process.kill(pid, "SIGTERM");
        }
        waitForProcessExit(pid);
    }
}
function waitForProcessExit(pid, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (!processExists(pid)) {
            return;
        }
        sleep(100);
    }
}
function processExists(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
