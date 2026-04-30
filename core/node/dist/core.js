"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeStatusSnapshot = exports.runtimePreparationPlan = exports.runtimeDiagnostics = exports.loadRuntimeManifest = exports.installRuntimeFromArchive = exports.stopPortalServer = exports.startPortalServer = exports.getPortalStatus = exports.generatePortal = exports.PORTAL_URL = exports.setupDiagnostics = exports.readLogTail = exports.portDiagnostics = exports.pathDiagnostics = exports.serviceEnvironmentDiagnostic = exports.resolveServiceEnvironment = exports.initializeEnvFiles = exports.envFileDiagnostics = exports.validateAdapter = exports.serviceOrder = exports.loadAdapters = exports.integrationReadiness = exports.portableEnv = exports.getRoot = exports.dataWritable = void 0;
exports.startSkeleton = startSkeleton;
exports.getStatus = getStatus;
exports.stopSkeleton = stopSkeleton;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const environment_1 = require("./environment");
const diagnostics_1 = require("./diagnostics");
const portable_1 = require("./portable");
const portal_1 = require("./portal");
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
var diagnostics_2 = require("./diagnostics");
Object.defineProperty(exports, "pathDiagnostics", { enumerable: true, get: function () { return diagnostics_2.pathDiagnostics; } });
Object.defineProperty(exports, "portDiagnostics", { enumerable: true, get: function () { return diagnostics_2.portDiagnostics; } });
Object.defineProperty(exports, "readLogTail", { enumerable: true, get: function () { return diagnostics_2.readLogTail; } });
Object.defineProperty(exports, "setupDiagnostics", { enumerable: true, get: function () { return diagnostics_2.setupDiagnostics; } });
var portal_2 = require("./portal");
Object.defineProperty(exports, "PORTAL_URL", { enumerable: true, get: function () { return portal_2.PORTAL_URL; } });
Object.defineProperty(exports, "generatePortal", { enumerable: true, get: function () { return portal_2.generatePortal; } });
Object.defineProperty(exports, "getPortalStatus", { enumerable: true, get: function () { return portal_2.getPortalStatus; } });
Object.defineProperty(exports, "startPortalServer", { enumerable: true, get: function () { return portal_2.startPortalServer; } });
Object.defineProperty(exports, "stopPortalServer", { enumerable: true, get: function () { return portal_2.stopPortalServer; } });
var runtimes_1 = require("./runtimes");
Object.defineProperty(exports, "installRuntimeFromArchive", { enumerable: true, get: function () { return runtimes_1.installRuntimeFromArchive; } });
Object.defineProperty(exports, "loadRuntimeManifest", { enumerable: true, get: function () { return runtimes_1.loadRuntimeManifest; } });
Object.defineProperty(exports, "runtimeDiagnostics", { enumerable: true, get: function () { return runtimes_1.runtimeDiagnostics; } });
Object.defineProperty(exports, "runtimePreparationPlan", { enumerable: true, get: function () { return runtimes_1.runtimePreparationPlan; } });
var status_2 = require("./status");
Object.defineProperty(exports, "writeStatusSnapshot", { enumerable: true, get: function () { return status_2.writeStatusSnapshot; } });
async function startSkeleton(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const setup = (0, diagnostics_1.setupDiagnostics)(root);
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
