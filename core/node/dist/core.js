"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeStatusSnapshot = exports.runtimePreparationPlan = exports.runtimeDiagnostics = exports.loadRuntimeManifest = exports.installRuntimeFromArchive = exports.stopPortalServer = exports.startPortalServer = exports.getPortalStatus = exports.generatePortal = exports.PORTAL_URL = exports.serviceEnvironmentDiagnostic = exports.resolveServiceEnvironment = exports.initializeEnvFiles = exports.envFileDiagnostics = exports.validateAdapter = exports.serviceOrder = exports.loadAdapters = exports.integrationReadiness = exports.portableEnv = exports.getRoot = exports.dataWritable = void 0;
exports.setupDiagnostics = setupDiagnostics;
exports.readLogTail = readLogTail;
exports.pathDiagnostics = pathDiagnostics;
exports.portDiagnostics = portDiagnostics;
exports.startSkeleton = startSkeleton;
exports.getStatus = getStatus;
exports.stopSkeleton = stopSkeleton;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
const portal_1 = require("./portal");
const runtimes_1 = require("./runtimes");
const status_1 = require("./status");
var portable_2 = require("./portable");
Object.defineProperty(exports, "dataWritable", { enumerable: true, get: function () { return portable_2.dataWritable; } });
Object.defineProperty(exports, "getRoot", { enumerable: true, get: function () { return portable_2.getRoot; } });
Object.defineProperty(exports, "portableEnv", { enumerable: true, get: function () { return portable_2.portableEnv; } });
var adapters_2 = require("./adapters");
Object.defineProperty(exports, "integrationReadiness", { enumerable: true, get: function () { return adapters_2.integrationReadiness; } });
Object.defineProperty(exports, "loadAdapters", { enumerable: true, get: function () { return adapters_2.loadAdapters; } });
Object.defineProperty(exports, "serviceOrder", { enumerable: true, get: function () { return adapters_2.serviceOrder; } });
Object.defineProperty(exports, "validateAdapter", { enumerable: true, get: function () { return adapters_2.validateAdapter; } });
var environment_2 = require("./environment");
Object.defineProperty(exports, "envFileDiagnostics", { enumerable: true, get: function () { return environment_2.envFileDiagnostics; } });
Object.defineProperty(exports, "initializeEnvFiles", { enumerable: true, get: function () { return environment_2.initializeEnvFiles; } });
Object.defineProperty(exports, "resolveServiceEnvironment", { enumerable: true, get: function () { return environment_2.resolveServiceEnvironment; } });
Object.defineProperty(exports, "serviceEnvironmentDiagnostic", { enumerable: true, get: function () { return environment_2.serviceEnvironmentDiagnostic; } });
var portal_2 = require("./portal");
Object.defineProperty(exports, "PORTAL_URL", { enumerable: true, get: function () { return portal_2.PORTAL_URL; } });
Object.defineProperty(exports, "generatePortal", { enumerable: true, get: function () { return portal_2.generatePortal; } });
Object.defineProperty(exports, "getPortalStatus", { enumerable: true, get: function () { return portal_2.getPortalStatus; } });
Object.defineProperty(exports, "startPortalServer", { enumerable: true, get: function () { return portal_2.startPortalServer; } });
Object.defineProperty(exports, "stopPortalServer", { enumerable: true, get: function () { return portal_2.stopPortalServer; } });
var runtimes_2 = require("./runtimes");
Object.defineProperty(exports, "installRuntimeFromArchive", { enumerable: true, get: function () { return runtimes_2.installRuntimeFromArchive; } });
Object.defineProperty(exports, "loadRuntimeManifest", { enumerable: true, get: function () { return runtimes_2.loadRuntimeManifest; } });
Object.defineProperty(exports, "runtimeDiagnostics", { enumerable: true, get: function () { return runtimes_2.runtimeDiagnostics; } });
Object.defineProperty(exports, "runtimePreparationPlan", { enumerable: true, get: function () { return runtimes_2.runtimePreparationPlan; } });
var status_2 = require("./status");
Object.defineProperty(exports, "writeStatusSnapshot", { enumerable: true, get: function () { return status_2.writeStatusSnapshot; } });
function setupDiagnostics(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapters = (0, adapters_1.loadAdapters)(root);
    const knownIds = adapters.map((adapter) => adapter.id);
    const adapterResults = adapters.map((adapter) => (0, adapters_1.validateAdapter)(adapter, knownIds));
    const runtimes = (0, runtimes_1.runtimeDiagnostics)(root);
    const readiness = (0, adapters_1.integrationReadiness)(adapters);
    const ports = portDiagnostics(root);
    const paths = pathDiagnostics(root);
    const envFiles = (0, environment_1.envFileDiagnostics)(root, adapters);
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
async function startSkeleton(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const setup = setupDiagnostics(root);
    const started = [];
    for (const adapter of (0, adapters_1.serviceOrder)(root, "start").filter((item) => item.enabled)) {
        const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
        const logFile = (0, portable_1.resolveRelative)(root, adapter.logFile);
        const serviceEnv = (0, environment_1.resolveServiceEnvironment)(root, adapter.id);
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
    (0, portal_1.generatePortal)(root, getStatus(root).services);
    const portal = await (0, portal_1.startPortalServer)(root);
    (0, status_1.writeStatusSnapshot)(root, getStatus(root));
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
            if (metadata.placeholder === false && metadata.processId && !(0, status_1.processExists)(metadata.processId)) {
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
            health: (0, status_1.adapterHealth)(adapter, status, placeholder),
        };
    });
    services.push((0, portal_1.getPortalStatus)(root));
    return { root, generatedAt: new Date().toISOString(), services };
}
function stopSkeleton(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const stopped = [];
    if ((0, portal_1.stopPortalServer)(root))
        stopped.push("portal");
    for (const adapter of (0, adapters_1.serviceOrder)(root, "stop")) {
        const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
        if ((0, node_fs_1.existsSync)(pidFile)) {
            const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
            if (metadata.placeholder === false && metadata.processId) {
                try {
                    (0, portal_1.killProcessTree)(metadata.processId);
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
