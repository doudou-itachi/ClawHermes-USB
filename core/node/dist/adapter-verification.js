"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAdapter = verifyAdapter;
const node_fs_1 = require("node:fs");
const adapters_1 = require("./adapters");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
const status_1 = require("./status");
const wsl_1 = require("./wsl");
function verifyAdapter(usbRoot, serviceId) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (!serviceId)
        throw new Error("Service id is required. Example: verify-adapter hermes-web-ui");
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === serviceId);
    if (!adapter)
        throw new Error(`Unknown adapter: ${serviceId}`);
    const checks = [];
    const appDirPath = (0, portable_1.resolveRelative)(root, adapter.appDir);
    const appDirReady = (0, node_fs_1.existsSync)(appDirPath) && directoryHasRealContent(appDirPath);
    checks.push(check("app-dir-ready", "App directory", appDirReady, appDirReady ? `App directory contains real content: ${adapter.appDir}` : `App directory is missing or placeholder-only: ${adapter.appDir}`));
    const setupCommand = Boolean(adapter.commands.setup);
    checks.push(check("setup-command", "Setup command", setupCommand, setupCommand ? `Setup command is declared: ${adapter.commands.setup}` : "Setup command is missing."));
    const setupLog = (0, portable_1.resolveRelative)(root, `data/logs/setup-${adapter.id}.log`);
    const setupOutput = (0, node_fs_1.existsSync)(setupLog);
    checks.push(check("setup-output", "Setup output", setupOutput, setupOutput ? `Setup log exists: data/logs/setup-${adapter.id}.log` : `Setup log is missing: data/logs/setup-${adapter.id}.log`));
    const startCommand = Boolean(adapter.commands.start);
    checks.push(check("start-command", "Start command", startCommand, startCommand ? `Start command is declared: ${adapter.commands.start}` : "Start command is missing."));
    const envFiles = (0, environment_1.envFileDiagnostics)(root, [adapter]);
    const envReady = envFiles.every((file) => file.exists);
    checks.push(check("env-files", "Env files", envReady, envReady ? "All declared env files exist." : "One or more declared env files are missing."));
    const healthDeclared = Boolean(adapter.health?.type);
    checks.push(check("health-declared", "Health declaration", healthDeclared, healthDeclared ? `Health check type is ${adapter.health?.type}.` : "Health check is missing."));
    const wsl = adapter.runtime?.kind === "wsl2" ? (0, wsl_1.wslDiagnostics)(root, adapter.runtime.distro) : null;
    if (wsl) {
        checks.push(check("wsl-executable", "WSL executable", wsl.found, wsl.found ? `WSL executable is available: ${wsl.executablePath}` : wsl.messages.join(" ")));
        const targetReady = adapter.runtime?.distro
            ? wsl.hasDesiredDistro && wsl.desiredDistroVersion === 2
            : wsl.hasWsl2Distro;
        checks.push(check("wsl-target-distro", "WSL2 target distribution", targetReady, targetReady
            ? `WSL2 target distribution is ready: ${adapter.runtime?.distro ?? wsl.defaultDistro}.`
            : wsl.messages.join(" ")));
    }
    const health = healthBehavior(adapter);
    checks.push({
        id: "health-behavior",
        label: "Health behavior",
        status: health.ready ? "pass" : "fail",
        message: health.reason,
    });
    const productionReadyCandidate = checks.every((item) => item.status === "pass");
    return {
        root,
        serviceId,
        displayName: adapter.displayName,
        generatedAt: new Date().toISOString(),
        productionReadyCandidate,
        checks,
        envFiles: envFiles.map((file) => ({
            path: file.path,
            exists: file.exists,
            examplePath: file.examplePath,
            exampleExists: file.exampleExists,
        })),
        wsl,
        health,
        nextSteps: checks.filter((item) => item.status !== "pass").map((item) => item.message),
    };
}
function check(id, label, passed, message) {
    return {
        id,
        label,
        status: passed ? "pass" : "fail",
        message,
    };
}
function healthBehavior(adapter) {
    if (!adapter.health?.type)
        return { type: "unknown", ready: false, reason: "Health check is missing." };
    if (adapter.health.type === "process")
        return { type: "process", ready: Boolean(adapter.commands.start), reason: adapter.commands.start ? "Process health can be verified by managed startup." : "Process health requires a start command." };
    return (0, status_1.adapterHealth)(adapter, "running", false);
}
function directoryHasRealContent(path) {
    try {
        return (0, node_fs_1.readdirSync)(path).some((entry) => entry !== ".gitkeep");
    }
    catch {
        return false;
    }
}
