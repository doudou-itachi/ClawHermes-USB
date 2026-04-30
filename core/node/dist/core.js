"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeStatusSnapshot = exports.runtimePreparationPlan = exports.runtimeDiagnostics = exports.loadRuntimeManifest = exports.installRuntimeFromArchive = exports.stopPortalServer = exports.startPortalServer = exports.getPortalStatus = exports.generatePortal = exports.PORTAL_URL = exports.writeSetupSnapshot = exports.setupDiagnostics = exports.readLogTail = exports.portDiagnostics = exports.pathDiagnostics = exports.serviceEnvironmentDiagnostic = exports.resolveServiceEnvironment = exports.initializeEnvFiles = exports.envFileDiagnostics = exports.createBackup = exports.validateAdapter = exports.serviceOrder = exports.loadAdapters = exports.integrationReadiness = exports.portableEnv = exports.getRoot = exports.dataWritable = void 0;
exports.startSkeleton = startSkeleton;
exports.getStatus = getStatus;
exports.stopSkeleton = stopSkeleton;
const node_fs_1 = require("node:fs");
const adapters_1 = require("./adapters");
const diagnostics_1 = require("./diagnostics");
const lifecycle_1 = require("./lifecycle");
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
var backup_1 = require("./backup");
Object.defineProperty(exports, "createBackup", { enumerable: true, get: function () { return backup_1.createBackup; } });
var environment_1 = require("./environment");
Object.defineProperty(exports, "envFileDiagnostics", { enumerable: true, get: function () { return environment_1.envFileDiagnostics; } });
Object.defineProperty(exports, "initializeEnvFiles", { enumerable: true, get: function () { return environment_1.initializeEnvFiles; } });
Object.defineProperty(exports, "resolveServiceEnvironment", { enumerable: true, get: function () { return environment_1.resolveServiceEnvironment; } });
Object.defineProperty(exports, "serviceEnvironmentDiagnostic", { enumerable: true, get: function () { return environment_1.serviceEnvironmentDiagnostic; } });
var diagnostics_2 = require("./diagnostics");
Object.defineProperty(exports, "pathDiagnostics", { enumerable: true, get: function () { return diagnostics_2.pathDiagnostics; } });
Object.defineProperty(exports, "portDiagnostics", { enumerable: true, get: function () { return diagnostics_2.portDiagnostics; } });
Object.defineProperty(exports, "readLogTail", { enumerable: true, get: function () { return diagnostics_2.readLogTail; } });
Object.defineProperty(exports, "setupDiagnostics", { enumerable: true, get: function () { return diagnostics_2.setupDiagnostics; } });
Object.defineProperty(exports, "writeSetupSnapshot", { enumerable: true, get: function () { return diagnostics_2.writeSetupSnapshot; } });
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
    (0, diagnostics_1.writeSetupSnapshot)(root, setup);
    const started = [];
    for (const adapter of (0, adapters_1.serviceOrder)(root, "start").filter((item) => item.enabled)) {
        (0, lifecycle_1.startAdapter)(root, adapter);
        started.push(adapter.id);
    }
    (0, portal_1.generatePortal)(root, getStatus(root).services);
    const portal = await (0, portal_1.startPortalServer)(root);
    (0, status_1.writeStatusSnapshot)(root, getStatus(root));
    return { root, started, portal, setupMessages: setup.messages };
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
        if ((0, lifecycle_1.stopAdapter)(root, adapter))
            stopped.push(adapter.id);
    }
    return { root, stopped };
}
