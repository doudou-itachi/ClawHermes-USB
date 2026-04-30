"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adapterSetupPlan = adapterSetupPlan;
exports.appSourcePlan = appSourcePlan;
exports.probeAppSources = probeAppSources;
exports.checkoutAppSource = checkoutAppSource;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
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
function appSourcePlan(usbRoot, serviceId) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapters = (0, adapters_1.loadAdapters)(root);
    const selected = serviceId ? adapters.filter((adapter) => adapter.id === serviceId) : adapters;
    if (serviceId && selected.length === 0)
        throw new Error(`Unknown adapter: ${serviceId}`);
    return {
        root,
        generatedAt: new Date().toISOString(),
        wouldModify: false,
        sources: selected.map((adapter) => sourcePlanItem(root, adapter)),
    };
}
function probeAppSources(usbRoot, serviceId) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapters = (0, adapters_1.loadAdapters)(root);
    const selected = serviceId ? adapters.filter((adapter) => adapter.id === serviceId) : adapters;
    if (serviceId && selected.length === 0)
        throw new Error(`Unknown adapter: ${serviceId}`);
    return {
        root,
        generatedAt: new Date().toISOString(),
        wouldModify: false,
        sources: selected.map((adapter) => probeSource(root, adapter)),
    };
}
function checkoutAppSource(usbRoot, serviceId, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (!serviceId)
        throw new Error("Service id is required. Example: checkout-source hermes-web-ui --confirm-checkout");
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === serviceId);
    if (!adapter)
        throw new Error(`Unknown adapter: ${serviceId}`);
    if (!adapter.upstream?.repositoryUrl)
        throw new Error(`Adapter ${serviceId} does not declare an upstream repositoryUrl.`);
    const source = sourcePlanItem(root, adapter);
    const result = {
        root,
        serviceId,
        displayName: adapter.displayName,
        dryRun: options.dryRun,
        confirmed: options.confirm,
        wouldModify: !options.dryRun,
        cloned: false,
        repositoryUrl: adapter.upstream.repositoryUrl,
        checkoutRef: adapter.upstream.checkoutRef ?? null,
        appDir: adapter.appDir,
        targetPath: source.targetPath,
        command: checkoutCommand(adapter),
        actions: checkoutActions(source.appDirExists),
        message: options.dryRun ? `Would checkout ${serviceId} into ${adapter.appDir}.` : `Checked out ${serviceId} into ${adapter.appDir}.`,
    };
    if (!options.dryRun && !options.confirm) {
        throw new Error("checkout-source modifies apps/ and may use network. Re-run with --confirm-checkout to proceed.");
    }
    if (source.appDirReady) {
        throw new Error(`App directory already contains real content: ${adapter.appDir}`);
    }
    if (options.dryRun)
        return result;
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(source.targetPath), { recursive: true });
    removePlaceholderFiles(source.targetPath);
    const completed = (0, node_child_process_1.spawnSync)("git", checkoutArgs(adapter, source.targetPath), {
        cwd: root,
        env: { ...process.env, ...(0, portable_1.portableEnv)(root) },
        encoding: "utf8",
    });
    if (completed.error)
        throw new Error(`git clone failed: ${completed.error.message}`);
    if (completed.status !== 0) {
        throw new Error(`git clone failed: ${(completed.stderr || completed.stdout || "unknown error").trim()}`);
    }
    return { ...result, cloned: true };
}
function probeSource(root, adapter) {
    const upstream = adapter.upstream ?? null;
    if (!upstream?.repositoryUrl) {
        return {
            id: adapter.id,
            displayName: adapter.displayName,
            upstream,
            repositoryUrl: null,
            checkoutRef: null,
            reachable: false,
            refFound: false,
            wouldModify: false,
            exitCode: null,
            message: "Adapter does not declare an upstream repositoryUrl.",
        };
    }
    const baseProbe = (0, node_child_process_1.spawnSync)("git", ["ls-remote", upstream.repositoryUrl], {
        cwd: root,
        env: { ...process.env, ...(0, portable_1.portableEnv)(root) },
        encoding: "utf8",
        timeout: 30000,
        windowsHide: true,
    });
    const reachable = !baseProbe.error && baseProbe.status === 0;
    if (!reachable) {
        return {
            id: adapter.id,
            displayName: adapter.displayName,
            upstream,
            repositoryUrl: upstream.repositoryUrl,
            checkoutRef: upstream.checkoutRef ?? null,
            reachable: false,
            refFound: false,
            wouldModify: false,
            exitCode: baseProbe.status,
            message: `Repository is not reachable: ${probeError(baseProbe)}`,
        };
    }
    const ref = upstream.checkoutRef;
    const refFound = ref ? refExists(root, upstream.repositoryUrl, ref) : true;
    return {
        id: adapter.id,
        displayName: adapter.displayName,
        upstream,
        repositoryUrl: upstream.repositoryUrl,
        checkoutRef: ref ?? null,
        reachable: true,
        refFound,
        wouldModify: false,
        exitCode: baseProbe.status,
        message: ref ? (refFound ? `Repository is reachable and ref ${ref} exists.` : `Repository is reachable but ref ${ref} was not found.`) : "Repository is reachable; no checkoutRef is declared.",
    };
}
function refExists(root, repositoryUrl, ref) {
    const refProbe = (0, node_child_process_1.spawnSync)("git", ["ls-remote", repositoryUrl, ref], {
        cwd: root,
        env: { ...process.env, ...(0, portable_1.portableEnv)(root) },
        encoding: "utf8",
        timeout: 30000,
        windowsHide: true,
    });
    return !refProbe.error && refProbe.status === 0 && refProbe.stdout.trim().length > 0;
}
function probeError(probe) {
    if (probe.error)
        return probe.error.message;
    return (typeof probe.stderr === "string" && probe.stderr.trim()) || (typeof probe.stdout === "string" && probe.stdout.trim()) || `exit code ${probe.status ?? "unknown"}`;
}
function sourcePlanItem(root, adapter) {
    const appDirPath = (0, portable_1.resolveRelative)(root, adapter.appDir);
    const appDirExists = (0, node_fs_1.existsSync)(appDirPath);
    const appDirReady = appDirExists && directoryHasRealContent(appDirPath);
    return {
        id: adapter.id,
        displayName: adapter.displayName,
        appDir: adapter.appDir,
        targetPath: appDirPath,
        appDirExists,
        appDirReady,
        upstream: adapter.upstream ?? null,
        checkoutCommand: checkoutCommand(adapter),
        wouldModify: false,
    };
}
function checkoutCommand(adapter) {
    if (!adapter.upstream?.repositoryUrl)
        return null;
    const branch = adapter.upstream.checkoutRef ? ` --branch ${adapter.upstream.checkoutRef}` : "";
    return `git clone${branch} ${adapter.upstream.repositoryUrl} ${adapter.appDir}`;
}
function checkoutArgs(adapter, targetPath) {
    const args = ["clone"];
    if (adapter.upstream?.checkoutRef)
        args.push("--branch", adapter.upstream.checkoutRef);
    args.push(adapter.upstream?.repositoryUrl ?? "", targetPath);
    return args;
}
function checkoutActions(appDirExists) {
    const actions = [];
    if (!appDirExists)
        actions.push("Create target app directory parent.");
    actions.push("Remove placeholder .gitkeep if present.");
    actions.push("Run git clone for the selected adapter.");
    return actions;
}
function removePlaceholderFiles(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return;
    for (const entry of (0, node_fs_1.readdirSync)(path)) {
        if (entry === ".gitkeep")
            (0, node_fs_1.rmSync)((0, node_path_1.join)(path, entry), { force: true });
    }
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
