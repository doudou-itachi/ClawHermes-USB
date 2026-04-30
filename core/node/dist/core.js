"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslDiagnostics = exports.writeStatusSnapshot = exports.runtimePreparationPlan = exports.runtimeDiagnostics = exports.loadRuntimeManifest = exports.installRuntimeFromArchive = exports.stopPortalServer = exports.startPortalServer = exports.getPortalStatus = exports.generatePortal = exports.PORTAL_URL = exports.writeSetupSnapshot = exports.setupDiagnostics = exports.readLogTail = exports.portDiagnostics = exports.pathDiagnostics = exports.serviceEnvironmentDiagnostic = exports.resolveServiceEnvironment = exports.initializeEnvFiles = exports.envFileDiagnostics = exports.createBackup = exports.verifyAdapter = exports.runAdapterSetup = exports.markAdapterReady = exports.probeAppSources = exports.checkoutAppSource = exports.appSourcePlan = exports.adapterSetupPlan = exports.validateAdapter = exports.serviceOrder = exports.loadAdapters = exports.integrationReadiness = exports.portableEnv = exports.getRoot = exports.dataWritable = void 0;
exports.startSkeleton = startSkeleton;
exports.startSingleAdapter = startSingleAdapter;
exports.getStatus = getStatus;
exports.stopSkeleton = stopSkeleton;
const node_fs_1 = require("node:fs");
const adapters_1 = require("./adapters");
const diagnostics_1 = require("./diagnostics");
const environment_1 = require("./environment");
const lifecycle_1 = require("./lifecycle");
const portable_1 = require("./portable");
const portal_1 = require("./portal");
const status_1 = require("./status");
const wsl_adapter_1 = require("./wsl-adapter");
var portable_2 = require("./portable");
Object.defineProperty(exports, "dataWritable", { enumerable: true, get: function () { return portable_2.dataWritable; } });
Object.defineProperty(exports, "getRoot", { enumerable: true, get: function () { return portable_2.getRoot; } });
Object.defineProperty(exports, "portableEnv", { enumerable: true, get: function () { return portable_2.portableEnv; } });
var adapters_2 = require("./adapters");
Object.defineProperty(exports, "integrationReadiness", { enumerable: true, get: function () { return adapters_2.integrationReadiness; } });
Object.defineProperty(exports, "loadAdapters", { enumerable: true, get: function () { return adapters_2.loadAdapters; } });
Object.defineProperty(exports, "serviceOrder", { enumerable: true, get: function () { return adapters_2.serviceOrder; } });
Object.defineProperty(exports, "validateAdapter", { enumerable: true, get: function () { return adapters_2.validateAdapter; } });
var adapter_guidance_1 = require("./adapter-guidance");
Object.defineProperty(exports, "adapterSetupPlan", { enumerable: true, get: function () { return adapter_guidance_1.adapterSetupPlan; } });
Object.defineProperty(exports, "appSourcePlan", { enumerable: true, get: function () { return adapter_guidance_1.appSourcePlan; } });
Object.defineProperty(exports, "checkoutAppSource", { enumerable: true, get: function () { return adapter_guidance_1.checkoutAppSource; } });
Object.defineProperty(exports, "probeAppSources", { enumerable: true, get: function () { return adapter_guidance_1.probeAppSources; } });
var adapter_metadata_1 = require("./adapter-metadata");
Object.defineProperty(exports, "markAdapterReady", { enumerable: true, get: function () { return adapter_metadata_1.markAdapterReady; } });
var adapter_setup_1 = require("./adapter-setup");
Object.defineProperty(exports, "runAdapterSetup", { enumerable: true, get: function () { return adapter_setup_1.runAdapterSetup; } });
var adapter_verification_1 = require("./adapter-verification");
Object.defineProperty(exports, "verifyAdapter", { enumerable: true, get: function () { return adapter_verification_1.verifyAdapter; } });
var backup_1 = require("./backup");
Object.defineProperty(exports, "createBackup", { enumerable: true, get: function () { return backup_1.createBackup; } });
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
var wsl_1 = require("./wsl");
Object.defineProperty(exports, "wslDiagnostics", { enumerable: true, get: function () { return wsl_1.wslDiagnostics; } });
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
function startSingleAdapter(usbRoot, serviceId, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (!serviceId)
        throw new Error("Service id is required. Example: start-adapter hermes-web-ui --confirm-start");
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === serviceId);
    if (!adapter)
        throw new Error(`Unknown adapter: ${serviceId}`);
    if (!adapter.commands.start)
        throw new Error(`Adapter ${serviceId} does not declare a start command.`);
    const wslPlan = adapter.runtime?.kind === "wsl2" ? (0, wsl_adapter_1.wslAdapterCommandPlan)(root, adapter, (0, environment_1.resolveServiceEnvironment)(root, serviceId), "start") : null;
    const result = {
        root,
        serviceId,
        displayName: adapter.displayName,
        runner: wslPlan ? "wsl2" : "windows",
        dryRun: options.dryRun,
        confirmed: options.confirm,
        wouldModify: !options.dryRun,
        started: false,
        command: adapter.commands.start,
        appDir: (0, portable_1.resolveRelative)(root, adapter.appDir),
        wsl: wslPlan
            ? {
                executablePath: wslPlan.executablePath,
                args: wslPlan.args,
                workingDirectory: wslPlan.workingDirectory,
                script: wslPlan.script,
            }
            : null,
        metadata: null,
        message: options.dryRun ? `Would start ${serviceId}.` : `Started ${serviceId}.`,
    };
    if (!options.dryRun && !options.confirm) {
        throw new Error("start-adapter launches a managed process. Re-run with --confirm-start to proceed.");
    }
    if (options.dryRun)
        return result;
    if (wslPlan) {
        (0, wsl_adapter_1.assertWslReadyForAdapterDistro)(root, serviceId, adapter.runtime?.distro);
        throw new Error(`WSL2 start supervision for ${serviceId} is not implemented yet. Use --dry-run to inspect the command plan.`);
    }
    const metadata = (0, lifecycle_1.startAdapter)(root, adapter, { forceManaged: true });
    return { ...result, started: true, metadata };
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
