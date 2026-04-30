"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRoot = getRoot;
exports.resolveRelative = resolveRelative;
exports.portableEnv = portableEnv;
exports.dataWritable = dataWritable;
exports.writeLog = writeLog;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
function getRoot(usbRoot) {
    return (0, node_path_1.resolve)(usbRoot);
}
function resolveRelative(usbRoot, relativePath) {
    return (0, node_path_1.join)(getRoot(usbRoot), ...relativePath.replaceAll("\\", "/").split("/").filter(Boolean));
}
function portableEnv(usbRoot) {
    const root = getRoot(usbRoot);
    return {
        USB_ROOT: root,
        HOME: (0, node_path_1.join)(root, "data", "home"),
        USERPROFILE: (0, node_path_1.join)(root, "data", "home"),
        APPDATA: (0, node_path_1.join)(root, "data", "home", "AppData", "Roaming"),
        LOCALAPPDATA: (0, node_path_1.join)(root, "data", "home", "AppData", "Local"),
        TEMP: (0, node_path_1.join)(root, "data", "tmp"),
        TMP: (0, node_path_1.join)(root, "data", "tmp"),
        HERMES_HOME: (0, node_path_1.join)(root, "data", "hermes"),
        npm_config_cache: (0, node_path_1.join)(root, "data", "cache", "npm"),
        PIP_CACHE_DIR: (0, node_path_1.join)(root, "data", "cache", "pip"),
        UV_CACHE_DIR: (0, node_path_1.join)(root, "data", "cache", "uv"),
        PATH: [
            (0, node_path_1.join)(root, "runtimes", "windows", "node"),
            (0, node_path_1.join)(root, "runtimes", "windows", "python"),
            (0, node_path_1.join)(root, "runtimes", "windows", "git", "cmd"),
            process.env.PATH ?? "",
        ].join(";"),
    };
}
function dataWritable(usbRoot) {
    const tmp = (0, node_path_1.join)(getRoot(usbRoot), "data", "tmp");
    (0, node_fs_1.mkdirSync)(tmp, { recursive: true });
    const probe = (0, node_path_1.join)(tmp, "write-probe.tmp");
    try {
        (0, node_fs_1.writeFileSync)(probe, "ok");
        (0, node_fs_1.rmSync)(probe, { force: true });
        return true;
    }
    catch {
        return false;
    }
}
function writeLog(usbRoot, serviceId, level, message) {
    const logDir = (0, node_path_1.join)(getRoot(usbRoot), "data", "logs");
    (0, node_fs_1.mkdirSync)(logDir, { recursive: true });
    (0, node_fs_1.appendFileSync)((0, node_path_1.join)(logDir, "launcher.log"), `${new Date().toISOString()} [${serviceId}] [${level}] ${message}\n`);
}
