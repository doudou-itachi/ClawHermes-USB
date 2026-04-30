"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PORTAL_URL = exports.runtimePreparationPlan = exports.runtimeDiagnostics = exports.loadRuntimeManifest = exports.installRuntimeFromArchive = exports.validateAdapter = exports.serviceOrder = exports.loadAdapters = exports.integrationReadiness = exports.portableEnv = exports.getRoot = exports.dataWritable = void 0;
exports.setupDiagnostics = setupDiagnostics;
exports.envFileDiagnostics = envFileDiagnostics;
exports.initializeEnvFiles = initializeEnvFiles;
exports.resolveServiceEnvironment = resolveServiceEnvironment;
exports.serviceEnvironmentDiagnostic = serviceEnvironmentDiagnostic;
exports.readLogTail = readLogTail;
exports.pathDiagnostics = pathDiagnostics;
exports.portDiagnostics = portDiagnostics;
exports.generatePortal = generatePortal;
exports.startPortalServer = startPortalServer;
exports.getPortalStatus = getPortalStatus;
exports.stopPortalServer = stopPortalServer;
exports.startSkeleton = startSkeleton;
exports.getStatus = getStatus;
exports.writeStatusSnapshot = writeStatusSnapshot;
exports.stopSkeleton = stopSkeleton;
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_http_1 = require("node:http");
const adapters_1 = require("./adapters");
const portable_1 = require("./portable");
const runtimes_1 = require("./runtimes");
var portable_2 = require("./portable");
Object.defineProperty(exports, "dataWritable", { enumerable: true, get: function () { return portable_2.dataWritable; } });
Object.defineProperty(exports, "getRoot", { enumerable: true, get: function () { return portable_2.getRoot; } });
Object.defineProperty(exports, "portableEnv", { enumerable: true, get: function () { return portable_2.portableEnv; } });
var adapters_2 = require("./adapters");
Object.defineProperty(exports, "integrationReadiness", { enumerable: true, get: function () { return adapters_2.integrationReadiness; } });
Object.defineProperty(exports, "loadAdapters", { enumerable: true, get: function () { return adapters_2.loadAdapters; } });
Object.defineProperty(exports, "serviceOrder", { enumerable: true, get: function () { return adapters_2.serviceOrder; } });
Object.defineProperty(exports, "validateAdapter", { enumerable: true, get: function () { return adapters_2.validateAdapter; } });
var runtimes_2 = require("./runtimes");
Object.defineProperty(exports, "installRuntimeFromArchive", { enumerable: true, get: function () { return runtimes_2.installRuntimeFromArchive; } });
Object.defineProperty(exports, "loadRuntimeManifest", { enumerable: true, get: function () { return runtimes_2.loadRuntimeManifest; } });
Object.defineProperty(exports, "runtimeDiagnostics", { enumerable: true, get: function () { return runtimes_2.runtimeDiagnostics; } });
Object.defineProperty(exports, "runtimePreparationPlan", { enumerable: true, get: function () { return runtimes_2.runtimePreparationPlan; } });
exports.PORTAL_URL = "http://127.0.0.1:17000/";
function setupDiagnostics(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapters = (0, adapters_1.loadAdapters)(root);
    const knownIds = adapters.map((adapter) => adapter.id);
    const adapterResults = adapters.map((adapter) => (0, adapters_1.validateAdapter)(adapter, knownIds));
    const runtimes = (0, runtimes_1.runtimeDiagnostics)(root);
    const readiness = (0, adapters_1.integrationReadiness)(adapters);
    const ports = portDiagnostics(root);
    const paths = pathDiagnostics(root);
    const envFiles = envFileDiagnostics(root, adapters);
    const writable = (0, portable_1.dataWritable)(root);
    const messages = [];
    for (const runtime of runtimes) {
        if (!runtime.found)
            messages.push(`${runtime.label} not found at ${runtime.path}.`);
    }
    for (const adapter of adapterResults) {
        for (const error of adapter.errors)
            messages.push(`Adapter ${adapter.id}: ${error}`);
    }
    for (const item of readiness) {
        if (!item.productionReady)
            messages.push(`Adapter ${item.id} integration is not production-ready: ${item.summary}`);
    }
    for (const port of ports) {
        if (!port.available)
            messages.push(`Port ${port.port} is already in use for ${port.name}. Stop the conflicting process or change config/defaults/ports.json.`);
    }
    for (const path of paths) {
        if (path.required && !path.exists)
            messages.push(`Required ${path.type} is missing: ${path.path}.`);
    }
    for (const envFile of envFiles) {
        if (!envFile.exists) {
            messages.push(`Env file missing: ${envFile.path}. To configure ${envFile.serviceId}, copy ${envFile.examplePath} to ${envFile.path}.`);
        }
    }
    if (!writable)
        messages.push("Data directory is not writable.");
    return { root, adapters: adapterResults, runtimes, readiness, ports, paths, envFiles, dataWritable: writable, messages };
}
function envFileDiagnostics(usbRoot, adapters) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const diagnostics = [];
    const seen = new Set();
    for (const adapter of adapters) {
        for (const envFile of adapter.env?.files ?? []) {
            const key = `${adapter.id}:${envFile}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const examplePath = `${envFile}.example`;
            diagnostics.push({
                serviceId: adapter.id,
                path: envFile,
                exists: (0, node_fs_1.existsSync)((0, portable_1.resolveRelative)(root, envFile)),
                examplePath,
                exampleExists: (0, node_fs_1.existsSync)((0, portable_1.resolveRelative)(root, examplePath)),
            });
        }
    }
    return diagnostics.sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.path.localeCompare(b.path));
}
function initializeEnvFiles(usbRoot, dryRun) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const diagnostics = envFileDiagnostics(root, (0, adapters_1.loadAdapters)(root));
    const result = {
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
        const target = (0, portable_1.resolveRelative)(root, envFile.path);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(target), { recursive: true });
        (0, node_fs_1.copyFileSync)((0, portable_1.resolveRelative)(root, envFile.examplePath), target);
        result.files.push({ ...envFile, action: "created", reason: null });
        result.messages.push(`Created ${envFile.path} from ${envFile.examplePath}.`);
    }
    return result;
}
function resolveServiceEnvironment(usbRoot, serviceId) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === serviceId);
    if (!adapter) {
        throw new Error(`Unknown service: ${serviceId}`);
    }
    const env = { ...(0, portable_1.portableEnv)(root) };
    const files = [];
    const messages = [];
    for (const envPath of adapter.env?.files ?? []) {
        const absolutePath = (0, portable_1.resolveRelative)(root, envPath);
        if (!(0, node_fs_1.existsSync)(absolutePath)) {
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
        }
        else {
            messages.push(`Loaded env file with ${parsed.errors.length} parse issue(s): ${envPath}.`);
        }
    }
    for (const [name, value] of Object.entries(adapter.env?.variables ?? {})) {
        env[name] = expandEnvTemplate(value, env);
    }
    return { root, serviceId: adapter.id, env, files, messages };
}
function serviceEnvironmentDiagnostic(usbRoot, serviceId) {
    const resolved = resolveServiceEnvironment(usbRoot, serviceId);
    return {
        root: resolved.root,
        serviceId: resolved.serviceId,
        files: resolved.files,
        variables: Object.keys(resolved.env).sort(),
        messages: resolved.messages,
    };
}
function readLogTail(usbRoot, target, requestedLines) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const lineCount = Math.max(1, Math.min(Number.isFinite(requestedLines) ? Math.floor(requestedLines) : 50, 200));
    const logPath = resolveLogTarget(root, target);
    const exists = (0, node_fs_1.existsSync)(logPath);
    const lines = exists
        ? (0, node_fs_1.readFileSync)(logPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).slice(-lineCount)
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
function resolveLogTarget(usbRoot, target) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (target === "launcher")
        return (0, node_path_1.join)(root, "data", "logs", "launcher.log");
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === target);
    if (!adapter)
        throw new Error(`Unknown log target: ${target}`);
    return (0, portable_1.resolveRelative)(root, adapter.logFile);
}
function parseEnvFile(file) {
    const variables = {};
    const errors = [];
    const lines = (0, node_fs_1.readFileSync)(file, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const line = rawLine.trim();
        if (!line || line.startsWith("#"))
            continue;
        const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!match) {
            errors.push(`Line ${index + 1}: expected KEY=value.`);
            continue;
        }
        variables[match[1]] = unquoteEnvValue(match[2].trim());
    }
    return { variables, errors };
}
function unquoteEnvValue(value) {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}
function expandEnvTemplate(value, env) {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => env[name] ?? match);
}
function pathDiagnostics(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const required = [
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
        const absolute = (0, portable_1.resolveRelative)(root, item.path);
        const exists = (0, node_fs_1.existsSync)(absolute);
        return {
            path: item.path,
            type: item.type,
            required: true,
            exists: exists && (item.type === "file" ? !isDirectory(absolute) : isDirectory(absolute)),
        };
    });
}
function isDirectory(path) {
    try {
        return (0, node_fs_1.statSync)(path).isDirectory();
    }
    catch {
        return false;
    }
}
function portDiagnostics(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const configPath = (0, node_path_1.join)(root, "config", "defaults", "ports.json");
    const config = JSON.parse((0, node_fs_1.readFileSync)(configPath, "utf8"));
    const diagnostics = [];
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
function isTcpPortAvailableSync(port) {
    try {
        const output = (0, node_child_process_1.execFileSync)("powershell", [
            "-NoProfile",
            "-Command",
            `$client = [System.Net.Sockets.TcpClient]::new(); $async = $client.BeginConnect('127.0.0.1', ${port}, $null, $null); if ($async.AsyncWaitHandle.WaitOne(200)) { try { $client.EndConnect($async); 'true' } catch { 'false' } } else { 'false' }; $client.Close()`,
        ], { encoding: "utf8", timeout: 3000 }).trim();
        return output.toLowerCase() !== "true";
    }
    catch {
        return true;
    }
}
function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function generatePortal(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const portalPath = (0, node_path_1.join)(root, "portal", "index.html");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(portalPath), { recursive: true });
    const rows = getStatus(root).services.map((service) => {
        const logPath = service.logFile.startsWith(root)
            ? service.logFile.slice(root.length).replace(new RegExp(`^\\${node_path_1.sep}`), "").replaceAll("\\", "/")
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
      <p><strong>Data root:</strong> <code>${escapeHtml((0, node_path_1.join)(root, "data"))}</code></p>
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
    (0, node_fs_1.writeFileSync)(portalPath, html, "utf8");
    (0, portable_1.writeLog)(root, "portal", "INFO", "Generated portal/index.html.");
    return { path: portalPath, url: exports.PORTAL_URL };
}
function portalPidFile(usbRoot) {
    return (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "data", "tmp", "pids", "portal.pid");
}
function portalServerPath(usbRoot) {
    return (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "core", "node", "dist", "portal-server.js");
}
function portalProcesses(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    try {
        const output = (0, node_child_process_1.execFileSync)("powershell", [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*portal-server.js*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ], { encoding: "utf8" }).trim();
        if (!output)
            return [];
        const parsed = JSON.parse(output);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        return rows.filter((row) => {
            const item = row;
            return (typeof item.ProcessId === "number" &&
                typeof item.CommandLine === "string" &&
                /\bnode(?:\.exe)?\b/i.test(item.CommandLine) &&
                item.CommandLine.includes("portal-server.js") &&
                item.CommandLine.includes(root));
        });
    }
    catch {
        return [];
    }
}
function portalProcessById(usbRoot, pid) {
    return portalProcesses(usbRoot).find((processInfo) => processInfo.ProcessId === pid) ?? null;
}
async function tcpPortAvailable(port) {
    return new Promise((resolveAvailable) => {
        const server = (0, node_net_1.createServer)();
        server.once("error", () => resolveAvailable(false));
        server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
    });
}
async function portalReady(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ready = await new Promise((resolveReady) => {
            const request = (0, node_http_1.get)(exports.PORTAL_URL, (response) => {
                response.resume();
                resolveReady(response.statusCode === 200);
            });
            request.setTimeout(500, () => {
                request.destroy();
                resolveReady(false);
            });
            request.on("error", () => resolveReady(false));
        });
        if (ready)
            return true;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    return false;
}
function portalMetadata(root, processId) {
    return {
        serviceId: "portal",
        displayName: "Portal",
        status: "running",
        processId,
        startedAt: new Date().toISOString(),
        url: exports.PORTAL_URL,
        logFile: (0, node_path_1.join)(root, "data", "logs", "portal.log"),
    };
}
async function startPortalServer(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const pidFile = portalPidFile(root);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pidFile), { recursive: true });
    if ((0, node_fs_1.existsSync)(pidFile)) {
        const existing = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (existing.processId && portalProcessById(root, existing.processId))
            return existing;
        (0, node_fs_1.rmSync)(pidFile, { force: true });
    }
    const existingProcess = portalProcesses(root)[0];
    if (existingProcess) {
        const metadata = portalMetadata(root, existingProcess.ProcessId);
        (0, node_fs_1.writeFileSync)(pidFile, JSON.stringify(metadata, null, 2), "utf8");
        (0, portable_1.writeLog)(root, "portal", "INFO", "Reused existing portal server on http://127.0.0.1:17000/.");
        return metadata;
    }
    if (!(await tcpPortAvailable(17000))) {
        throw new Error("Port 17000 is already in use. Stop the conflicting process or change config/defaults/ports.json.");
    }
    const child = (0, node_child_process_1.spawn)(process.execPath, [portalServerPath(root), "--usb-root", root, "--port", "17000"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
    });
    child.unref();
    if (!(await portalReady())) {
        if (child.pid && portalProcessById(root, child.pid))
            process.kill(child.pid);
        throw new Error("Portal server did not become reachable at http://127.0.0.1:17000/.");
    }
    const metadata = portalMetadata(root, child.pid ?? 0);
    (0, node_fs_1.writeFileSync)(pidFile, JSON.stringify(metadata, null, 2), "utf8");
    (0, portable_1.writeLog)(root, "portal", "INFO", "Started portal server on http://127.0.0.1:17000/.");
    return metadata;
}
function getPortalStatus(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const pidFile = portalPidFile(root);
    let status = "stopped";
    let processId = null;
    if ((0, node_fs_1.existsSync)(pidFile)) {
        const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (metadata.processId && portalProcessById(root, metadata.processId)) {
            status = "running";
            processId = metadata.processId;
        }
        else if (portalProcesses(root).length > 0) {
            status = "running";
            processId = portalProcesses(root)[0]?.ProcessId ?? null;
        }
        else {
            (0, node_fs_1.rmSync)(pidFile, { force: true });
            status = "stopped";
        }
    }
    else if (portalProcesses(root).length > 0) {
        status = "running";
        processId = portalProcesses(root)[0]?.ProcessId ?? null;
    }
    return {
        id: "portal",
        displayName: "Portal",
        status,
        pidFile,
        logFile: (0, node_path_1.join)(root, "data", "logs", "portal.log"),
        portalUrl: exports.PORTAL_URL,
        processId,
        placeholder: false,
        health: {
            type: "http",
            ready: status === "running",
            reason: status === "running" ? "Portal HTTP server is running." : "Portal HTTP server is stopped.",
        },
    };
}
function stopPortalServer(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const pidFile = portalPidFile(root);
    let stopped = false;
    if ((0, node_fs_1.existsSync)(pidFile)) {
        const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (metadata.processId && portalProcessById(root, metadata.processId)) {
            killProcessTree(metadata.processId);
            stopped = true;
        }
        (0, node_fs_1.rmSync)(pidFile, { force: true });
    }
    for (const processInfo of portalProcesses(root)) {
        try {
            killProcessTree(processInfo.ProcessId);
            stopped = true;
        }
        catch {
            // Already gone.
        }
    }
    if (stopped)
        (0, portable_1.writeLog)(root, "portal", "INFO", "Stopped portal server.");
    return stopped;
}
function killProcessTree(pid) {
    if (process.platform === "win32") {
        (0, node_child_process_1.execFileSync)("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    }
    else {
        process.kill(pid, "SIGTERM");
    }
}
async function startSkeleton(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const setup = setupDiagnostics(root);
    const started = [];
    for (const adapter of (0, adapters_1.serviceOrder)(root, "start").filter((item) => item.enabled)) {
        const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
        const logFile = (0, portable_1.resolveRelative)(root, adapter.logFile);
        const serviceEnv = resolveServiceEnvironment(root, adapter.id);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pidFile), { recursive: true });
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
        const metadata = shouldLaunchManagedProcess(adapter)
            ? launchManagedAdapterProcess(root, adapter, serviceEnv)
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
        started.push(adapter.id);
    }
    generatePortal(root);
    const portal = await startPortalServer(root);
    writeStatusSnapshot(root, getStatus(root));
    return { root, started, portal, setupMessages: setup.messages };
}
function shouldLaunchManagedProcess(adapter) {
    return adapter.integration?.productionReady === true && Boolean(adapter.commands.start);
}
function environmentMetadata(serviceEnv) {
    return {
        files: serviceEnv.files,
        variables: Object.keys(serviceEnv.env).sort(),
    };
}
function launchManagedAdapterProcess(root, adapter, serviceEnv) {
    const command = adapter.commands.start;
    if (!command)
        throw new Error(`Adapter ${adapter.id} has no start command.`);
    const workingDirectory = (0, portable_1.resolveRelative)(root, adapter.appDir);
    const logFile = (0, portable_1.resolveRelative)(root, adapter.logFile);
    const logFd = (0, node_fs_1.openSync)(logFile, "a");
    try {
        const child = (0, node_child_process_1.spawn)(command, {
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
    }
    finally {
        (0, node_fs_1.closeSync)(logFd);
    }
}
function getStatus(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const services = (0, adapters_1.serviceOrder)(root, "start").map((adapter) => {
        const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
        let status = "stopped";
        let processId = null;
        let placeholder = null;
        if ((0, node_fs_1.existsSync)(pidFile)) {
            const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
            if (metadata.placeholder === false && metadata.processId && !processExists(metadata.processId)) {
                (0, node_fs_1.rmSync)(pidFile, { force: true });
                status = "stopped";
            }
            else {
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
            logFile: (0, portable_1.resolveRelative)(root, adapter.logFile),
            portalUrl: adapter.portal?.url ?? null,
            processId,
            placeholder,
            health: adapterHealth(adapter, status, placeholder),
        };
    });
    services.push(getPortalStatus(root));
    return { root, generatedAt: new Date().toISOString(), services };
}
function writeStatusSnapshot(usbRoot, status) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const snapshotPath = (0, node_path_1.join)(root, "data", "tmp", "status.json");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(snapshotPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(snapshotPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    return snapshotPath;
}
function adapterHealth(adapter, status, placeholder) {
    const type = typeof adapter.health?.type === "string" ? adapter.health.type : "unknown";
    const url = typeof adapter.health?.url === "string" ? adapter.health.url : null;
    if (status === "stopped") {
        return { type, ready: false, reason: "Service is stopped.", ...(url ? { url, statusCode: null } : {}) };
    }
    if (placeholder === true) {
        return { type, ready: false, reason: "Placeholder metadata is present, but no real process was launched.", ...(url ? { url, statusCode: null } : {}) };
    }
    if (type === "http")
        return httpAdapterHealth(adapter);
    if (type === "process" && status === "running") {
        return { type, ready: true, reason: "Managed process is running." };
    }
    return {
        type,
        ready: status === "running",
        reason: status === "running" ? "Service reports running." : `Service status is ${status}.`,
    };
}
function httpAdapterHealth(adapter) {
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
function probeHttpHealth(url, timeoutSeconds) {
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
        const output = (0, node_child_process_1.execFileSync)("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: timeoutMs + 1000 }).trim();
        const parsed = JSON.parse(output);
        if (parsed.ok === true) {
            return { ready: true, statusCode: parsed.statusCode ?? null, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
        }
        if (typeof parsed.statusCode === "number") {
            return { ready: false, statusCode: parsed.statusCode, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
        }
        return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${parsed.error ?? "request failed"}.` };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${message}.` };
    }
}
function escapePowerShellSingleQuoted(value) {
    return value.replaceAll("'", "''");
}
function processExists(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        const code = error.code;
        return code === "EPERM";
    }
}
function stopSkeleton(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const stopped = [];
    if (stopPortalServer(root))
        stopped.push("portal");
    for (const adapter of (0, adapters_1.serviceOrder)(root, "stop")) {
        const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
        if ((0, node_fs_1.existsSync)(pidFile)) {
            const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
            if (metadata.placeholder === false && metadata.processId) {
                try {
                    killProcessTree(metadata.processId);
                }
                catch {
                    // Already gone.
                }
            }
            (0, node_fs_1.rmSync)(pidFile, { force: true });
            (0, portable_1.writeLog)(root, adapter.id, "INFO", metadata.placeholder === false ? "Stopped managed service." : "Stopped placeholder service.");
            stopped.push(adapter.id);
        }
    }
    return { root, stopped };
}
