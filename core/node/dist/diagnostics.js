"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupDiagnostics = setupDiagnostics;
exports.readLogTail = readLogTail;
exports.pathDiagnostics = pathDiagnostics;
exports.portDiagnostics = portDiagnostics;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
const runtimes_1 = require("./runtimes");
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
