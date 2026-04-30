"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PORTAL_URL = void 0;
exports.getRoot = getRoot;
exports.portableEnv = portableEnv;
exports.loadAdapters = loadAdapters;
exports.validateAdapter = validateAdapter;
exports.runtimeDiagnostics = runtimeDiagnostics;
exports.loadRuntimeManifest = loadRuntimeManifest;
exports.runtimePreparationPlan = runtimePreparationPlan;
exports.installRuntimeFromArchive = installRuntimeFromArchive;
exports.integrationReadiness = integrationReadiness;
exports.dataWritable = dataWritable;
exports.setupDiagnostics = setupDiagnostics;
exports.envFileDiagnostics = envFileDiagnostics;
exports.initializeEnvFiles = initializeEnvFiles;
exports.pathDiagnostics = pathDiagnostics;
exports.portDiagnostics = portDiagnostics;
exports.generatePortal = generatePortal;
exports.startPortalServer = startPortalServer;
exports.getPortalStatus = getPortalStatus;
exports.stopPortalServer = stopPortalServer;
exports.startSkeleton = startSkeleton;
exports.getStatus = getStatus;
exports.stopSkeleton = stopSkeleton;
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_http_1 = require("node:http");
const node_crypto_1 = require("node:crypto");
exports.PORTAL_URL = "http://127.0.0.1:17000/";
function getRoot(usbRoot) {
    return (0, node_path_1.resolve)(usbRoot);
}
function portableEnv(usbRoot) {
    const root = getRoot(usbRoot);
    return {
        USB_ROOT: root,
        HOME: (0, node_path_1.join)(root, "data", "home"),
        USERPROFILE: (0, node_path_1.join)(root, "data", "home"),
        APPDATA: (0, node_path_1.join)(root, "data", "home", "AppData", "Roaming"),
        LOCALAPPDATA: (0, node_path_1.join)(root, "data", "home", "AppData", "Local"),
        TEMP: (0, node_path_1.join)(root, "data", "tmp"),
        TMP: (0, node_path_1.join)(root, "data", "tmp"),
        HERMES_HOME: (0, node_path_1.join)(root, "data", "hermes"),
        npm_config_cache: (0, node_path_1.join)(root, "data", "cache", "npm"),
        PIP_CACHE_DIR: (0, node_path_1.join)(root, "data", "cache", "pip"),
        UV_CACHE_DIR: (0, node_path_1.join)(root, "data", "cache", "uv"),
        PATH: [
            (0, node_path_1.join)(root, "runtimes", "windows", "node"),
            (0, node_path_1.join)(root, "runtimes", "windows", "python"),
            (0, node_path_1.join)(root, "runtimes", "windows", "git", "cmd"),
            process.env.PATH ?? "",
        ].join(";"),
    };
}
function loadAdapters(usbRoot) {
    const adapterRoot = (0, node_path_1.join)(getRoot(usbRoot), "adapters");
    return (0, node_fs_1.readdirSync)(adapterRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => (0, node_path_1.join)(adapterRoot, entry.name, "adapter.json"))
        .filter((file) => (0, node_fs_1.existsSync)(file))
        .map((file) => JSON.parse((0, node_fs_1.readFileSync)(file, "utf8")))
        .sort((a, b) => a.id.localeCompare(b.id));
}
function isRelativePath(value) {
    return !value || !(0, node_path_1.isAbsolute)(value);
}
function validateAdapter(adapter, knownIds) {
    const errors = [];
    if (!adapter.id)
        errors.push("id is required");
    if (!isRelativePath(adapter.appDir))
        errors.push("appDir must be relative");
    if (!isRelativePath(adapter.dataDir))
        errors.push("dataDir must be relative");
    if (!isRelativePath(adapter.logFile))
        errors.push("logFile must be relative");
    if (adapter.logFile && !adapter.logFile.replaceAll("\\", "/").startsWith("data/logs/")) {
        errors.push("logFile must be under data/logs");
    }
    if (!isRelativePath(adapter.pidFile))
        errors.push("pidFile must be relative");
    if (adapter.pidFile && !adapter.pidFile.replaceAll("\\", "/").startsWith("data/tmp/")) {
        errors.push("pidFile must be under data/tmp");
    }
    if (!adapter.health)
        errors.push("health is required");
    for (const dependency of adapter.dependsOn ?? []) {
        if (!knownIds.includes(dependency))
            errors.push(`dependsOn references unknown service: ${dependency}`);
    }
    return { id: adapter.id, valid: errors.length === 0, errors };
}
function runtimeDiagnostics(usbRoot) {
    const root = getRoot(usbRoot);
    const manifest = loadRuntimeManifest(root);
    return manifest.runtimes.map((runtime) => {
        const resolvedCandidates = runtime.candidates.map((candidate) => resolveRelative(root, candidate));
        const foundPath = resolvedCandidates.find((candidate) => (0, node_fs_1.existsSync)(candidate)) ?? resolvedCandidates[0];
        return {
            name: runtime.name,
            label: runtime.label,
            path: foundPath,
            found: resolvedCandidates.some((candidate) => (0, node_fs_1.existsSync)(candidate)),
            versionPolicy: runtime.versionPolicy,
            packageType: runtime.packageType,
            sourceUrl: runtime.sourceUrl,
            installDir: resolveRelative(root, runtime.installDir),
            candidates: resolvedCandidates,
            notes: runtime.notes,
        };
    });
}
function loadRuntimeManifest(usbRoot) {
    const manifestPath = (0, node_path_1.join)(getRoot(usbRoot), "config", "defaults", "runtimes.json");
    return JSON.parse((0, node_fs_1.readFileSync)(manifestPath, "utf8"));
}
function runtimePreparationPlan(usbRoot) {
    const root = getRoot(usbRoot);
    const manifest = loadRuntimeManifest(root);
    const diagnosticsByName = new Map(runtimeDiagnostics(root).map((runtime) => [runtime.name, runtime]));
    const steps = manifest.runtimes.map((runtime) => {
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
function installRuntimeFromArchive(usbRoot, runtimeName, archivePath, dryRun, expectedSha256) {
    const root = getRoot(usbRoot);
    const manifest = loadRuntimeManifest(root);
    const runtime = manifest.runtimes.find((item) => item.name === runtimeName);
    if (!runtime) {
        throw new Error(`Unknown runtime: ${runtimeName}`);
    }
    const archive = (0, node_path_1.resolve)(archivePath);
    if (!(0, node_fs_1.existsSync)(archive)) {
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
        (0, node_fs_1.mkdirSync)(installDir, { recursive: true });
        const tempDir = (0, node_path_1.join)(root, "data", "tmp", "runtime-extract", `${runtime.name}-${Date.now()}`);
        (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(tempDir, { recursive: true });
        try {
            (0, node_child_process_1.execFileSync)("powershell", [
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
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    }
    const installed = expectedExecutables.some((candidate) => (0, node_fs_1.existsSync)(candidate));
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
function sha256File(file) {
    const hash = (0, node_crypto_1.createHash)("sha256");
    hash.update((0, node_fs_1.readFileSync)(file));
    return hash.digest("hex");
}
function copyExtractedRuntime(sourceDir, installDir) {
    const entries = (0, node_fs_1.readdirSync)(sourceDir, { withFileTypes: true });
    const contentRoot = entries.length === 1 && entries[0]?.isDirectory()
        ? (0, node_path_1.join)(sourceDir, entries[0].name)
        : sourceDir;
    copyDirectoryContents(contentRoot, installDir);
}
function copyDirectoryContents(sourceDir, targetDir) {
    (0, node_fs_1.mkdirSync)(targetDir, { recursive: true });
    for (const entry of (0, node_fs_1.readdirSync)(sourceDir, { withFileTypes: true })) {
        const source = (0, node_path_1.join)(sourceDir, entry.name);
        const target = (0, node_path_1.join)(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryContents(source, target);
        }
        else if (entry.isFile()) {
            (0, node_fs_1.writeFileSync)(target, (0, node_fs_1.readFileSync)(source));
        }
    }
}
function integrationReadiness(adapters) {
    return adapters.map((adapter) => ({
        id: adapter.id,
        status: adapter.integration?.status ?? "unknown",
        productionReady: adapter.integration?.productionReady === true,
        verifiedAt: adapter.integration?.verifiedAt ?? null,
        summary: adapter.integration?.summary ?? "No upstream integration metadata has been recorded for this adapter.",
        sources: adapter.integration?.sources ?? [],
    }));
}
function dataWritable(usbRoot) {
    const tmp = (0, node_path_1.join)(getRoot(usbRoot), "data", "tmp");
    (0, node_fs_1.mkdirSync)(tmp, { recursive: true });
    const probe = (0, node_path_1.join)(tmp, "write-probe.tmp");
    try {
        (0, node_fs_1.writeFileSync)(probe, "ok");
        (0, node_fs_1.rmSync)(probe, { force: true });
        return true;
    }
    catch {
        return false;
    }
}
function setupDiagnostics(usbRoot) {
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
    const root = getRoot(usbRoot);
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
                exists: (0, node_fs_1.existsSync)(resolveRelative(root, envFile)),
                examplePath,
                exampleExists: (0, node_fs_1.existsSync)(resolveRelative(root, examplePath)),
            });
        }
    }
    return diagnostics.sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.path.localeCompare(b.path));
}
function initializeEnvFiles(usbRoot, dryRun) {
    const root = getRoot(usbRoot);
    const diagnostics = envFileDiagnostics(root, loadAdapters(root));
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
        const target = resolveRelative(root, envFile.path);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(target), { recursive: true });
        (0, node_fs_1.copyFileSync)(resolveRelative(root, envFile.examplePath), target);
        result.files.push({ ...envFile, action: "created", reason: null });
        result.messages.push(`Created ${envFile.path} from ${envFile.examplePath}.`);
    }
    return result;
}
function pathDiagnostics(usbRoot) {
    const root = getRoot(usbRoot);
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
        const absolute = resolveRelative(root, item.path);
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
    const root = getRoot(usbRoot);
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
function resolveRelative(usbRoot, relativePath) {
    return (0, node_path_1.join)(getRoot(usbRoot), ...relativePath.replaceAll("\\", "/").split("/").filter(Boolean));
}
function writeLog(usbRoot, serviceId, level, message) {
    const logDir = (0, node_path_1.join)(getRoot(usbRoot), "data", "logs");
    (0, node_fs_1.mkdirSync)(logDir, { recursive: true });
    (0, node_fs_1.appendFileSync)((0, node_path_1.join)(logDir, "launcher.log"), `${new Date().toISOString()} [${serviceId}] [${level}] ${message}\n`);
}
function serviceOrder(usbRoot, order) {
    const root = getRoot(usbRoot);
    const adapters = loadAdapters(root);
    const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
    const configPath = (0, node_path_1.join)(root, "config", "defaults", "services.json");
    const ordered = [];
    if ((0, node_fs_1.existsSync)(configPath)) {
        const config = JSON.parse((0, node_fs_1.readFileSync)(configPath, "utf8"));
        const ids = order === "start" ? config.startOrder ?? [] : config.stopOrder ?? [];
        for (const id of ids) {
            const adapter = byId.get(id);
            if (adapter)
                ordered.push(adapter);
        }
    }
    for (const adapter of adapters) {
        if (!ordered.some((item) => item.id === adapter.id))
            ordered.push(adapter);
    }
    return ordered;
}
function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function generatePortal(usbRoot) {
    const root = getRoot(usbRoot);
    const portalPath = (0, node_path_1.join)(root, "portal", "index.html");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(portalPath), { recursive: true });
    const rows = getStatus(root).services.map((service) => {
        const logPath = service.logFile.startsWith(root)
            ? service.logFile.slice(root.length).replace(new RegExp(`^\\${node_path_1.sep}`), "").replaceAll("\\", "/")
            : service.logFile;
        const url = service.portalUrl ? `<a href="${escapeHtml(service.portalUrl)}">${escapeHtml(service.portalUrl)}</a>` : "<span>Pending upstream URL</span>";
        return `<tr><td>${escapeHtml(service.displayName)}</td><td>${escapeHtml(service.id)}</td><td>${escapeHtml(service.status)}</td><td>${url}</td><td><code>${escapeHtml(logPath)}</code></td></tr>`;
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
        <thead><tr><th>Service</th><th>ID</th><th>Status</th><th>URL</th><th>Log</th></tr></thead>
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
</body>
</html>
`;
    (0, node_fs_1.writeFileSync)(portalPath, html, "utf8");
    writeLog(root, "portal", "INFO", "Generated portal/index.html.");
    return { path: portalPath, url: exports.PORTAL_URL };
}
function portalPidFile(usbRoot) {
    return (0, node_path_1.join)(getRoot(usbRoot), "data", "tmp", "pids", "portal.pid");
}
function portalServerPath(usbRoot) {
    return (0, node_path_1.join)(getRoot(usbRoot), "core", "node", "dist", "portal-server.js");
}
function portalProcesses(usbRoot) {
    const root = getRoot(usbRoot);
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
    const root = getRoot(usbRoot);
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
        writeLog(root, "portal", "INFO", "Reused existing portal server on http://127.0.0.1:17000/.");
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
    writeLog(root, "portal", "INFO", "Started portal server on http://127.0.0.1:17000/.");
    return metadata;
}
function getPortalStatus(usbRoot) {
    const root = getRoot(usbRoot);
    const pidFile = portalPidFile(root);
    let status = "stopped";
    if ((0, node_fs_1.existsSync)(pidFile)) {
        const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (metadata.processId && portalProcessById(root, metadata.processId)) {
            status = "running";
        }
        else if (portalProcesses(root).length > 0) {
            status = "running";
        }
        else {
            (0, node_fs_1.rmSync)(pidFile, { force: true });
            status = "stopped";
        }
    }
    else if (portalProcesses(root).length > 0) {
        status = "running";
    }
    return {
        id: "portal",
        displayName: "Portal",
        status,
        pidFile,
        logFile: (0, node_path_1.join)(root, "data", "logs", "portal.log"),
        portalUrl: exports.PORTAL_URL,
    };
}
function stopPortalServer(usbRoot) {
    const root = getRoot(usbRoot);
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
        writeLog(root, "portal", "INFO", "Stopped portal server.");
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
    const root = getRoot(usbRoot);
    const setup = setupDiagnostics(root);
    const started = [];
    for (const adapter of serviceOrder(root, "start").filter((item) => item.enabled)) {
        const pidFile = resolveRelative(root, adapter.pidFile);
        const logFile = resolveRelative(root, adapter.logFile);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pidFile), { recursive: true });
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
        const metadata = {
            serviceId: adapter.id,
            displayName: adapter.displayName,
            status: "placeholder-started",
            startedAt: new Date().toISOString(),
            command: adapter.commands.start ?? null,
            workingDirectory: resolveRelative(root, adapter.appDir),
            logFile,
            placeholder: true,
        };
        (0, node_fs_1.writeFileSync)(pidFile, JSON.stringify(metadata, null, 2), "utf8");
        (0, node_fs_1.appendFileSync)(logFile, `${new Date().toISOString()} [${adapter.id}] [INFO] Placeholder service started.\n`);
        writeLog(root, adapter.id, "INFO", "Started placeholder service.");
        started.push(adapter.id);
    }
    generatePortal(root);
    const portal = await startPortalServer(root);
    return { root, started, portal, setupMessages: setup.messages };
}
function getStatus(usbRoot) {
    const root = getRoot(usbRoot);
    const services = serviceOrder(root, "start").map((adapter) => {
        const pidFile = resolveRelative(root, adapter.pidFile);
        let status = "stopped";
        if ((0, node_fs_1.existsSync)(pidFile)) {
            const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
            status = metadata.status ?? "unknown";
        }
        return {
            id: adapter.id,
            displayName: adapter.displayName,
            status,
            pidFile,
            logFile: resolveRelative(root, adapter.logFile),
            portalUrl: adapter.portal?.url ?? null,
        };
    });
    services.push(getPortalStatus(root));
    return { root, services };
}
function stopSkeleton(usbRoot) {
    const root = getRoot(usbRoot);
    const stopped = [];
    if (stopPortalServer(root))
        stopped.push("portal");
    for (const adapter of serviceOrder(root, "stop")) {
        const pidFile = resolveRelative(root, adapter.pidFile);
        if ((0, node_fs_1.existsSync)(pidFile)) {
            (0, node_fs_1.rmSync)(pidFile, { force: true });
            writeLog(root, adapter.id, "INFO", "Stopped placeholder service.");
            stopped.push(adapter.id);
        }
    }
    return { root, stopped };
}
