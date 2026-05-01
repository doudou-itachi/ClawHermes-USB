"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslUnregister = exports.wslRootfsGuide = exports.wslImportPlan = exports.wslImport = exports.wslExport = exports.wslDiagnostics = exports.prepareWsl = exports.writeStatusSnapshot = exports.setupWizard = exports.readRuntimePortState = exports.assignRuntimePorts = exports.payloadInventory = exports.payloadExport = exports.sharedModelConfigStatus = exports.configureSharedModel = exports.runtimePreparationPlan = exports.runtimeDiagnostics = exports.loadRuntimeManifest = exports.installRuntimeFromArchive = exports.stopPortalServer = exports.startPortalServer = exports.getPortalStatus = exports.generatePortal = exports.PORTAL_URL = exports.writeSetupSnapshot = exports.setupDiagnostics = exports.readLogTail = exports.portDiagnostics = exports.pathDiagnostics = exports.serviceEnvironmentDiagnostic = exports.resolveServiceEnvironment = exports.initializeEnvFiles = exports.envFileDiagnostics = exports.restorePlan = exports.restoreBackup = exports.createBackup = exports.verifyAdapter = exports.runAdapterSetup = exports.markAdapterReady = exports.probeAppSources = exports.checkoutAppSource = exports.appSourcePlan = exports.adapterSetupPlan = exports.validateAdapter = exports.serviceOrder = exports.loadAdapters = exports.integrationReadiness = exports.portableEnv = exports.getRoot = exports.dataWritable = void 0;
exports.wslWorkflowPlan = exports.wslUnregisterPlan = void 0;
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
const wsl_1 = require("./wsl");
const ports_runtime_1 = require("./ports-runtime");
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
Object.defineProperty(exports, "restoreBackup", { enumerable: true, get: function () { return backup_1.restoreBackup; } });
Object.defineProperty(exports, "restorePlan", { enumerable: true, get: function () { return backup_1.restorePlan; } });
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
var model_config_1 = require("./model-config");
Object.defineProperty(exports, "configureSharedModel", { enumerable: true, get: function () { return model_config_1.configureSharedModel; } });
Object.defineProperty(exports, "sharedModelConfigStatus", { enumerable: true, get: function () { return model_config_1.sharedModelConfigStatus; } });
var payload_export_1 = require("./payload-export");
Object.defineProperty(exports, "payloadExport", { enumerable: true, get: function () { return payload_export_1.payloadExport; } });
var payloads_1 = require("./payloads");
Object.defineProperty(exports, "payloadInventory", { enumerable: true, get: function () { return payloads_1.payloadInventory; } });
var ports_runtime_2 = require("./ports-runtime");
Object.defineProperty(exports, "assignRuntimePorts", { enumerable: true, get: function () { return ports_runtime_2.assignRuntimePorts; } });
Object.defineProperty(exports, "readRuntimePortState", { enumerable: true, get: function () { return ports_runtime_2.readRuntimePortState; } });
var setup_wizard_1 = require("./setup-wizard");
Object.defineProperty(exports, "setupWizard", { enumerable: true, get: function () { return setup_wizard_1.setupWizard; } });
var status_2 = require("./status");
Object.defineProperty(exports, "writeStatusSnapshot", { enumerable: true, get: function () { return status_2.writeStatusSnapshot; } });
var wsl_2 = require("./wsl");
Object.defineProperty(exports, "prepareWsl", { enumerable: true, get: function () { return wsl_2.prepareWsl; } });
Object.defineProperty(exports, "wslDiagnostics", { enumerable: true, get: function () { return wsl_2.wslDiagnostics; } });
var wsl_import_1 = require("./wsl-import");
Object.defineProperty(exports, "wslExport", { enumerable: true, get: function () { return wsl_import_1.wslExport; } });
Object.defineProperty(exports, "wslImport", { enumerable: true, get: function () { return wsl_import_1.wslImport; } });
Object.defineProperty(exports, "wslImportPlan", { enumerable: true, get: function () { return wsl_import_1.wslImportPlan; } });
Object.defineProperty(exports, "wslRootfsGuide", { enumerable: true, get: function () { return wsl_import_1.wslRootfsGuide; } });
Object.defineProperty(exports, "wslUnregister", { enumerable: true, get: function () { return wsl_import_1.wslUnregister; } });
Object.defineProperty(exports, "wslUnregisterPlan", { enumerable: true, get: function () { return wsl_import_1.wslUnregisterPlan; } });
var wsl_workflow_1 = require("./wsl-workflow");
Object.defineProperty(exports, "wslWorkflowPlan", { enumerable: true, get: function () { return wsl_workflow_1.wslWorkflowPlan; } });
async function startSkeleton(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const setup = (0, diagnostics_1.setupDiagnostics)(root);
    (0, diagnostics_1.writeSetupSnapshot)(root, setup);
    const started = [];
    const adapters = (0, adapters_1.serviceOrder)(root, "start").filter((item) => item.enabled);
    const portState = await (0, ports_runtime_1.assignRuntimePorts)(root, adapters);
    for (const sourceAdapter of adapters) {
        const adapter = (0, ports_runtime_1.applyRuntimePortsToAdapter)(sourceAdapter, portState);
        const serviceEnv = (0, ports_runtime_1.applyRuntimePortsToEnvironment)((0, environment_1.resolveServiceEnvironment)(root, adapter.id), portState);
        const shouldPrepareWslPlan = adapter.runtime?.kind === "wsl2" && adapter.integration?.productionReady === true && Boolean(adapter.commands.start);
        const wslPlan = shouldPrepareWslPlan ? (0, wsl_adapter_1.wslAdapterCommandPlan)(root, adapter, serviceEnv, "start") : null;
        if (wslPlan && adapter.integration?.productionReady === true) {
            (0, wsl_adapter_1.assertWslReadyForAdapterDistro)(root, adapter.id, adapter.runtime?.distro);
        }
        (0, lifecycle_1.startAdapter)(root, adapter, wslPlan ? { processPlan: wslManagedProcessPlan(root, wslPlan), serviceEnv } : { serviceEnv });
        started.push(adapter.id);
    }
    (0, portal_1.generatePortal)(root, getStatus(root).services);
    const portal = await (0, portal_1.startPortalServer)(root, portState.portal.assignedPort);
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
    const portState = (0, ports_runtime_1.readRuntimePortState)(root);
    const runtimeAdapter = (0, ports_runtime_1.applyRuntimePortsToAdapter)(adapter, portState);
    const serviceEnv = (0, ports_runtime_1.applyRuntimePortsToEnvironment)((0, environment_1.resolveServiceEnvironment)(root, serviceId), portState);
    const wslPlan = runtimeAdapter.runtime?.kind === "wsl2" ? (0, wsl_adapter_1.wslAdapterCommandPlan)(root, runtimeAdapter, serviceEnv, "start") : null;
    const result = {
        root,
        serviceId,
        displayName: runtimeAdapter.displayName,
        runner: wslPlan ? "wsl2" : "windows",
        dryRun: options.dryRun,
        confirmed: options.confirm,
        wouldModify: !options.dryRun,
        started: false,
        command: runtimeAdapter.commands.start,
        appDir: (0, portable_1.resolveRelative)(root, runtimeAdapter.appDir),
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
        (0, wsl_adapter_1.assertWslReadyForAdapterDistro)(root, serviceId, runtimeAdapter.runtime?.distro);
        const metadata = (0, lifecycle_1.startAdapter)(root, runtimeAdapter, {
            forceManaged: true,
            processPlan: wslManagedProcessPlan(root, wslPlan),
            serviceEnv,
        });
        return { ...result, started: true, metadata };
    }
    const metadata = (0, lifecycle_1.startAdapter)(root, runtimeAdapter, { forceManaged: true, serviceEnv });
    return { ...result, started: true, metadata };
}
function wslManagedProcessPlan(root, wslPlan) {
    const invocation = (0, wsl_1.wslExecutableInvocation)(wslPlan.executablePath, wslPlan.args);
    const hostScript = [
        "const { spawn } = require('node:child_process');",
        "const executablePath = process.env.CLAWHERMES_WSL_HOST_EXE;",
        "const args = JSON.parse(process.env.CLAWHERMES_WSL_HOST_ARGS || '[]');",
        "if (!executablePath) { process.stderr.write('CLAWHERMES_WSL_HOST_EXE is not set.\\n'); process.exit(1); }",
        "const child = spawn(executablePath, args, { stdio: 'inherit', windowsHide: true, shell: false });",
        "child.on('error', (error) => { process.stderr.write(`${error.message}\\n`); process.exit(1); });",
        "child.on('exit', (code, signal) => { process.exit(code ?? (signal ? 1 : 0)); });",
    ].join("");
    return {
        runner: "wsl2",
        executablePath: process.execPath,
        args: ["-e", hostScript],
        env: {
            CLAWHERMES_WSL_HOST_EXE: invocation.executablePath,
            CLAWHERMES_WSL_HOST_ARGS: JSON.stringify(invocation.args),
        },
        command: `${process.execPath} -e <wsl-host> # launches ${wslPlan.executablePath} ${wslPlan.args.join(" ")}`,
        workingDirectory: root,
        metadata: {
            wsl: {
                executablePath: wslPlan.executablePath,
                args: wslPlan.args,
                workingDirectory: wslPlan.workingDirectory,
                script: wslPlan.script,
            },
        },
    };
}
function getStatus(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const portState = (0, ports_runtime_1.readRuntimePortState)(root);
    const services = (0, adapters_1.serviceOrder)(root, "start").map((sourceAdapter) => {
        const adapter = (0, ports_runtime_1.applyRuntimePortsToAdapter)(sourceAdapter, portState);
        const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
        let status = "stopped";
        let processId = null;
        let placeholder = null;
        let healthOverride = null;
        if ((0, node_fs_1.existsSync)(pidFile)) {
            const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
            if (metadata.placeholder === false && metadata.runner === "wsl2-background") {
                const candidateStatus = metadata.status ?? "running";
                const candidateHealth = adapter.runtime?.kind === "wsl2" && adapter.health?.type === "http"
                    ? (0, status_1.adapterHealth)(adapter, candidateStatus, false)
                    : null;
                if (candidateHealth?.ready) {
                    status = candidateStatus;
                    processId = null;
                    placeholder = false;
                    healthOverride = candidateHealth;
                }
                else {
                    (0, node_fs_1.rmSync)(pidFile, { force: true });
                    status = "stopped";
                }
            }
            else if (metadata.placeholder === false && metadata.processId && !(0, status_1.processExists)(metadata.processId)) {
                const candidateStatus = metadata.status ?? "running";
                const candidateHealth = adapter.runtime?.kind === "wsl2" && adapter.health?.type === "http"
                    ? (0, status_1.adapterHealth)(adapter, candidateStatus, false)
                    : null;
                if (candidateHealth?.ready) {
                    status = candidateStatus;
                    processId = null;
                    placeholder = false;
                    healthOverride = candidateHealth;
                }
                else {
                    (0, node_fs_1.rmSync)(pidFile, { force: true });
                    status = "stopped";
                }
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
            health: healthOverride ?? (0, status_1.adapterHealth)(adapter, status, placeholder),
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
