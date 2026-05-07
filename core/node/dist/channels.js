"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeixinChannelStatus = getWeixinChannelStatus;
exports.startWeixinChannelLogin = startWeixinChannelLogin;
exports.stopWeixinChannelLogin = stopWeixinChannelLogin;
exports.readWeixinChannelLog = readWeixinChannelLog;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const environment_1 = require("./environment");
const lifecycle_1 = require("./lifecycle");
const portable_1 = require("./portable");
const status_1 = require("./status");
const WEIXIN_PACKAGE_PATH = (0, node_path_1.join)("node_modules", "@tencent-weixin", "openclaw-weixin");
const WEIXIN_PLUGIN_ID = "openclaw-weixin";
function getWeixinChannelStatus(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const logFile = weixinLogPath(root);
    const command = weixinCommand(root).join(" ");
    const metadata = readWeixinMetadata(root);
    const installed = weixinPluginInstalled(root);
    if (!installed) {
        return {
            root,
            channel: "openclaw-weixin",
            displayName: "微信",
            status: "missing-plugin",
            command,
            logFile,
            messages: [
                "WeChat channel plugin is not installed under apps/openclaw/node_modules.",
                "Install @tencent-weixin/openclaw-weixin in the OpenClaw payload before scanning to log in.",
            ],
        };
    }
    if (metadata?.processId && (0, status_1.processExists)(metadata.processId)) {
        return {
            root,
            channel: "openclaw-weixin",
            displayName: "微信",
            status: "running",
            processId: metadata.processId,
            command,
            logFile,
            messages: ["WeChat login is already running. Check the channel log for QR output."],
        };
    }
    return {
        root,
        channel: "openclaw-weixin",
        displayName: "微信",
        status: "stopped",
        command,
        logFile,
        messages: ["WeChat login is ready to start."],
    };
}
function startWeixinChannelLogin(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const existing = getWeixinChannelStatus(root);
    if (existing.status === "missing-plugin" || existing.status === "running")
        return existing;
    const appDir = openclawAppDir(root);
    const openclawMjs = openclawEntry(root);
    if (!(0, node_fs_1.existsSync)(openclawMjs)) {
        return {
            ...existing,
            status: "missing-plugin",
            messages: [`OpenClaw entry is missing: ${openclawMjs}`],
        };
    }
    const logFile = weixinLogPath(root);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
    (0, node_fs_1.writeFileSync)(logFile, `${new Date().toISOString()} Starting openclaw-weixin login.\n${existing.command}\n\n`, "utf8");
    const serviceEnv = (0, environment_1.resolveServiceEnvironment)(root, "openclaw");
    const env = {
        ...process.env,
        ...serviceEnv.env,
        PATH: patchedPath(root),
    };
    const registration = ensureWeixinPluginRegistered(root, env);
    if (registration.output) {
        (0, node_fs_1.writeFileSync)(logFile, `${registration.output.trimEnd()}\n\n`, { flag: "a" });
    }
    if (!registration.ok) {
        return {
            ...existing,
            status: "stopped",
            messages: registration.messages,
        };
    }
    const child = (0, node_child_process_1.spawn)(weixinCommand(root)[0], weixinCommand(root).slice(1), {
        cwd: appDir,
        env,
        detached: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
    });
    const append = (chunk) => {
        (0, node_fs_1.writeFileSync)(logFile, chunk, { flag: "a" });
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("exit", (code) => {
        (0, node_fs_1.writeFileSync)(logFile, `\n${new Date().toISOString()} Login process exited with code ${code ?? "unknown"}.\n`, { flag: "a" });
        (0, node_fs_1.rmSync)(weixinMetadataPath(root), { force: true });
    });
    child.unref();
    const status = {
        ...existing,
        status: "started",
        processId: child.pid,
        messages: ["WeChat login command started. Scan the QR code shown in the channel log."],
    };
    (0, node_fs_1.writeFileSync)(weixinMetadataPath(root), `${JSON.stringify(status, null, 2)}\n`, "utf8");
    return status;
}
function stopWeixinChannelLogin(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const current = getWeixinChannelStatus(root);
    if (current.processId && (0, status_1.processExists)(current.processId)) {
        (0, lifecycle_1.killProcessTree)(current.processId);
    }
    (0, node_fs_1.rmSync)(weixinMetadataPath(root), { force: true });
    return {
        ...getWeixinChannelStatus(root),
        messages: ["WeChat channel login process has been stopped."],
    };
}
function readWeixinChannelLog(usbRoot, lines = 120) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const logFile = weixinLogPath(root);
    if (!(0, node_fs_1.existsSync)(logFile)) {
        return { target: "channel-weixin", path: logFile, exists: false, lines: [] };
    }
    const text = (0, node_fs_1.readFileSync)(logFile, "utf8");
    return {
        target: "channel-weixin",
        path: logFile,
        exists: true,
        lines: text.split(/\r?\n/).slice(-Math.max(1, lines)),
    };
}
function weixinPluginInstalled(root) {
    return (0, node_fs_1.existsSync)((0, node_path_1.join)(openclawAppDir(root), WEIXIN_PACKAGE_PATH));
}
function ensureWeixinPluginRegistered(root, env) {
    const pluginPath = weixinPluginPath(root);
    if (!(0, node_fs_1.existsSync)(pluginPath)) {
        return {
            ok: false,
            messages: [`WeChat channel plugin directory is missing: ${pluginPath}`],
        };
    }
    if (weixinPluginRegistered(root, env, pluginPath)) {
        return {
            ok: true,
            messages: ["WeChat channel plugin is registered."],
        };
    }
    const command = [
        nodeCommand(root),
        openclawEntry(root),
        "plugins",
        "install",
        pluginPath,
        "--link",
    ];
    const result = (0, node_child_process_1.spawnSync)(command[0], command.slice(1), {
        cwd: openclawAppDir(root),
        env,
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        timeout: 90_000,
    });
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    if (result.error) {
        return {
            ok: false,
            output,
            messages: [`Failed to register WeChat channel plugin: ${result.error.message}`],
        };
    }
    if (result.status !== 0) {
        return {
            ok: false,
            output,
            messages: [`Failed to register WeChat channel plugin. Exit code: ${result.status ?? "unknown"}.`],
        };
    }
    if (!weixinPluginRegistered(root, env, pluginPath)) {
        return {
            ok: false,
            output,
            messages: ["WeChat channel plugin registration command completed, but OpenClaw config still does not reference the plugin."],
        };
    }
    return {
        ok: true,
        output,
        messages: ["WeChat channel plugin was registered from the local payload."],
    };
}
function weixinPluginRegistered(root, env, pluginPath) {
    const expectedPath = normalizePathForCompare(pluginPath);
    const config = readJsonObject(env.OPENCLAW_CONFIG_PATH || (0, node_path_1.join)(root, "data", "openclaw", "openclaw.json"));
    const loadPaths = Array.isArray(config?.plugins?.load?.paths) ? config.plugins.load.paths : [];
    const configHasPath = loadPaths.some((item) => typeof item === "string" && normalizePathForCompare(item) === expectedPath);
    const configEnablesPlugin = config?.plugins?.entries?.[WEIXIN_PLUGIN_ID]?.enabled === true;
    const stateDir = env.OPENCLAW_STATE_DIR || (0, node_path_1.join)(root, "data", "openclaw");
    const installs = readJsonObject((0, node_path_1.join)(stateDir, "plugins", "installs.json"));
    const record = installs?.installRecords?.[WEIXIN_PLUGIN_ID];
    const recordPath = typeof record?.installPath === "string" ? record.installPath : typeof record?.sourcePath === "string" ? record.sourcePath : "";
    const recordHasPath = normalizePathForCompare(recordPath) === expectedPath;
    return configHasPath && configEnablesPlugin && recordHasPath;
}
function readJsonObject(filePath) {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(filePath, "utf8"));
        return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
    }
    catch {
        return null;
    }
}
function normalizePathForCompare(value) {
    return (0, node_path_1.resolve)(value).replaceAll("/", "\\").toLowerCase();
}
function readWeixinMetadata(root) {
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(weixinMetadataPath(root), "utf8"));
    }
    catch {
        return null;
    }
}
function weixinCommand(root) {
    return [
        nodeCommand(root),
        openclawEntry(root),
        "channels",
        "login",
        "--channel",
        "openclaw-weixin",
    ];
}
function nodeCommand(root) {
    const portableNode = (0, node_path_1.join)(root, "runtimes", "windows", "node", "node.exe");
    return (0, node_fs_1.existsSync)(portableNode) ? portableNode : "node";
}
function patchedPath(root) {
    return [
        (0, node_path_1.join)(root, "runtimes", "windows", "node"),
        (0, node_path_1.join)(openclawAppDir(root), "node_modules", ".bin"),
        process.env.PATH ?? "",
    ].filter(Boolean).join(node_path_1.delimiter);
}
function openclawAppDir(root) {
    return (0, node_path_1.join)(root, "apps", "openclaw");
}
function openclawEntry(root) {
    return (0, node_path_1.join)(openclawAppDir(root), "openclaw.mjs");
}
function weixinPluginPath(root) {
    return (0, node_path_1.join)(openclawAppDir(root), WEIXIN_PACKAGE_PATH);
}
function weixinLogPath(root) {
    return (0, node_path_1.join)(root, "data", "logs", "channel-weixin.log");
}
function weixinMetadataPath(root) {
    return (0, node_path_1.join)(root, "data", "tmp", "pids", "channel-weixin.json");
}
