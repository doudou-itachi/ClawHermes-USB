"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adapterSetupPlan = adapterSetupPlan;
const node_fs_1 = require("node:fs");
const adapters_1 = require("./adapters");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
function adapterSetupPlan(usbRoot, serviceId) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapters = (0, adapters_1.loadAdapters)(root);
    const selected = serviceId ? adapters.filter((adapter) => adapter.id === serviceId) : adapters;
    if (serviceId && selected.length === 0)
        throw new Error(`Unknown adapter: ${serviceId}`);
    const readiness = new Map((0, adapters_1.integrationReadiness)(adapters).map((item) => [item.id, item]));
    const envFiles = (0, environment_1.envFileDiagnostics)(root, adapters);
    return {
        root,
        generatedAt: new Date().toISOString(),
        adapters: selected.map((adapter) => adapterSetupItem(root, adapter, readiness.get(adapter.id), envFiles.filter((item) => item.serviceId === adapter.id))),
    };
}
function adapterSetupItem(root, adapter, readiness, envFiles) {
    const appDirExists = (0, node_fs_1.existsSync)((0, portable_1.resolveRelative)(root, adapter.appDir));
    const appDirReady = appDirExists && directoryHasRealContent((0, portable_1.resolveRelative)(root, adapter.appDir));
    const dataDirExists = (0, node_fs_1.existsSync)((0, portable_1.resolveRelative)(root, adapter.dataDir));
    return {
        id: adapter.id,
        displayName: adapter.displayName,
        enabled: adapter.enabled,
        type: adapter.type,
        appDir: adapter.appDir,
        appDirExists,
        appDirReady,
        dataDir: adapter.dataDir,
        dataDirExists,
        upstream: adapter.upstream ?? null,
        runtime: adapter.runtime ?? null,
        commands: {
            setup: adapter.commands.setup ?? null,
            start: adapter.commands.start ?? null,
            stop: adapter.commands.stop ?? null,
        },
        envFiles: envFiles.map((file) => ({
            path: file.path,
            exists: file.exists,
            examplePath: file.examplePath,
            exampleExists: file.exampleExists,
        })),
        dependsOn: adapter.dependsOn ?? [],
        integration: readiness ?? {
            id: adapter.id,
            status: "unknown",
            productionReady: false,
            verifiedAt: null,
            summary: "No upstream integration metadata has been recorded for this adapter.",
            sources: [],
        },
        portal: adapter.portal ?? null,
        nextSteps: adapterNextSteps(adapter, appDirExists, appDirReady, envFiles, readiness),
    };
}
function directoryHasRealContent(path) {
    try {
        return (0, node_fs_1.readdirSync)(path).some((entry) => entry !== ".gitkeep");
    }
    catch {
        return false;
    }
}
function adapterNextSteps(adapter, appDirExists, appDirReady, envFiles, readiness) {
    const steps = [];
    if (!appDirExists) {
        steps.push(`Place or checkout the upstream application at ${adapter.appDir}.`);
    }
    else if (!appDirReady && adapter.upstream?.repositoryUrl) {
        steps.push(`Checkout upstream source from ${adapter.upstream.repositoryUrl} into ${adapter.appDir}.`);
    }
    if (envFiles.some((file) => !file.exists)) {
        steps.push("Run node core/node/dist/clawhermes.js init-env --dry-run --json, then create the missing env files.");
    }
    if (adapter.commands.setup) {
        steps.push(`Run the adapter setup command from ${adapter.appDir}: ${adapter.commands.setup}.`);
    }
    else {
        steps.push("Record a verified adapter setup command when upstream installation is confirmed.");
    }
    if (!adapter.commands.start) {
        steps.push("Record a verified start command before enabling real managed startup.");
    }
    if (readiness?.productionReady !== true) {
        steps.push("Review integration readiness metadata and verify upstream behavior before marking the adapter production-ready.");
    }
    return steps;
}
