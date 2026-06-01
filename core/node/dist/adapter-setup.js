"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAdapterSetup = runAdapterSetup;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const command_template_1 = require("./command-template");
const environment_1 = require("./environment");
const portable_1 = require("./portable");
const wsl_adapter_1 = require("./wsl-adapter");
const wsl_1 = require("./wsl");
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
    const expandedCommand = (0, command_template_1.expandCommandTemplate)(command, serviceEnv.env);
    const logFile = (0, portable_1.resolveRelative)(root, `data/logs/setup-${serviceId}.log`);
    const wslPlan = adapter.runtime?.kind === "wsl2" ? (0, wsl_adapter_1.wslAdapterSetupPlan)(root, adapter, serviceEnv) : null;
    const result = {
        root,
        serviceId,
        displayName: adapter.displayName,
        runner: wslPlan ? "wsl2" : serviceEnv.env.CLAWHERMES_PLATFORM ?? "windows",
        dryRun: options.dryRun,
        confirmed: options.confirm,
        wouldModify: !options.dryRun,
        executed: false,
        command: expandedCommand,
        workingDirectory,
        logFile,
        wsl: wslPlan
            ? {
                executablePath: wslPlan.executablePath,
                args: wslPlan.args,
                workingDirectory: wslPlan.workingDirectory,
                script: wslPlan.script,
            }
            : null,
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
    if (wslPlan) {
        (0, wsl_adapter_1.assertWslReadyForAdapterDistro)(root, serviceId, adapter.runtime?.distro);
    }
    const wslInvocation = wslPlan ? (0, wsl_1.wslExecutableInvocation)(wslPlan.executablePath, wslPlan.args) : null;
    const completed = wslPlan && wslInvocation
        ? (0, node_child_process_1.spawnSync)(wslInvocation.executablePath, wslInvocation.args, {
            cwd: root,
            env: process.env,
            encoding: "utf8",
            windowsHide: true,
        })
        : (0, node_child_process_1.spawnSync)(expandedCommand, {
            cwd: workingDirectory,
            env: { ...process.env, ...serviceEnv.env },
            shell: true,
            encoding: "utf8",
            windowsHide: true,
        });
    appendSetupLog(logFile, serviceId, wslPlan ? `wsl ${wslPlan.args.join(" ")}` : expandedCommand, completed.stdout, completed.stderr, completed.status);
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
