"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAdapterSetup = runAdapterSetup;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
function runAdapterSetup(usbRoot, serviceId, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (!serviceId)
        throw new Error("Service id is required. Example: setup-adapter hermes-web-ui --confirm-setup");
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === serviceId);
    if (!adapter)
        throw new Error(`Unknown adapter: ${serviceId}`);
    const command = adapter.commands.setup;
    if (!command)
        throw new Error(`Adapter ${serviceId} does not declare a setup command.`);
    const workingDirectory = (0, portable_1.resolveRelative)(root, adapter.appDir);
    if (!(0, node_fs_1.existsSync)(workingDirectory) || !directoryHasRealContent(workingDirectory)) {
        throw new Error(`App directory is not ready for setup: ${adapter.appDir}`);
    }
    const serviceEnv = (0, environment_1.resolveServiceEnvironment)(root, serviceId);
    const logFile = (0, portable_1.resolveRelative)(root, `data/logs/setup-${serviceId}.log`);
    const result = {
        root,
        serviceId,
        displayName: adapter.displayName,
        dryRun: options.dryRun,
        confirmed: options.confirm,
        wouldModify: !options.dryRun,
        executed: false,
        command,
        workingDirectory,
        logFile,
        exitCode: null,
        environment: {
            files: serviceEnv.files,
            variables: Object.keys(serviceEnv.env).sort(),
        },
        message: options.dryRun ? `Would run setup for ${serviceId}.` : `Ran setup for ${serviceId}.`,
    };
    if (!options.dryRun && !options.confirm) {
        throw new Error("setup-adapter may modify app dependencies. Re-run with --confirm-setup to proceed.");
    }
    if (options.dryRun)
        return result;
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
    const completed = (0, node_child_process_1.spawnSync)(command, {
        cwd: workingDirectory,
        env: { ...process.env, ...serviceEnv.env },
        shell: true,
        encoding: "utf8",
        windowsHide: true,
    });
    appendSetupLog(logFile, serviceId, command, completed.stdout, completed.stderr, completed.status);
    if (completed.error)
        throw new Error(`Adapter setup failed: ${completed.error.message}`);
    if (completed.status !== 0) {
        throw new Error(`Adapter setup failed with exit code ${completed.status}: ${(completed.stderr || completed.stdout || "unknown error").trim()}`);
    }
    return { ...result, executed: true, exitCode: completed.status ?? 0 };
}
function appendSetupLog(logFile, serviceId, command, stdout, stderr, exitCode) {
    (0, node_fs_1.appendFileSync)(logFile, [
        `${new Date().toISOString()} [${serviceId}] setup command: ${command}`,
        `exitCode: ${exitCode ?? "unknown"}`,
        stdout ? `stdout:\n${stdout}` : "stdout: <empty>",
        stderr ? `stderr:\n${stderr}` : "stderr: <empty>",
        "",
    ].join("\n"), "utf8");
}
function directoryHasRealContent(path) {
    try {
        return (0, node_fs_1.readdirSync)(path).some((entry) => entry !== ".gitkeep");
    }
    catch {
        return false;
    }
}
