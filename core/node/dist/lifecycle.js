"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAdapter = startAdapter;
exports.stopAdapter = stopAdapter;
exports.killProcessTree = killProcessTree;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
function startAdapter(root, adapter, options = {}) {
    const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
    const logFile = (0, portable_1.resolveRelative)(root, adapter.logFile);
    const serviceEnv = (0, environment_1.resolveServiceEnvironment)(root, adapter.id);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pidFile), { recursive: true });
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
    const metadata = shouldLaunchManagedProcess(adapter, options.forceManaged === true)
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
    return metadata;
}
function shouldLaunchManagedProcess(adapter, forceManaged) {
    return (forceManaged || adapter.integration?.productionReady === true) && Boolean(adapter.commands.start);
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
function stopAdapter(root, adapter) {
    const pidFile = (0, portable_1.resolveRelative)(root, adapter.pidFile);
    if (!(0, node_fs_1.existsSync)(pidFile))
        return false;
    const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
    if (metadata.placeholder === false && metadata.processId) {
        try {
            killProcessTree(metadata.processId);
        }
        catch {
            // Already gone.
        }
    }
    (0, node_fs_1.rmSync)(pidFile, { force: true });
    (0, portable_1.writeLog)(root, adapter.id, "INFO", metadata.placeholder === false ? "Stopped managed service." : "Stopped placeholder service.");
    return true;
}
function killProcessTree(pid) {
    if (process.platform === "win32") {
        (0, node_child_process_1.execFileSync)("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    }
    else {
        process.kill(pid, "SIGTERM");
    }
}
