"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectPlatform = detectPlatform;
exports.runtimePathEntries = runtimePathEntries;
const node_path_1 = require("node:path");
function detectPlatform(probe = {}) {
    const nodePlatform = probe.platform ?? process.platform;
    const nodeArch = probe.arch ?? process.arch;
    const id = nodePlatform === "win32" ? "windows" : nodePlatform === "darwin" ? "darwin" : "linux";
    const arch = nodeArch === "arm64" ? "arm64" : "x64";
    return {
        id,
        nodePlatform,
        arch,
        runtimeKey: id === "darwin" ? `darwin-${arch}` : id,
        pathSeparator: id === "windows" ? ";" : ":",
        executableSuffix: id === "windows" ? ".exe" : "",
    };
}
function runtimePathEntries(usbRoot, info = detectPlatform()) {
    if (info.id === "darwin") {
        return [
            (0, node_path_1.join)(usbRoot, "runtimes", "macos", "node", info.runtimeKey, "bin"),
            (0, node_path_1.join)(usbRoot, "runtimes", "macos", "python", info.runtimeKey, "bin"),
            (0, node_path_1.join)(usbRoot, "runtimes", "macos", "git", info.runtimeKey, "bin"),
        ];
    }
    return [
        (0, node_path_1.join)(usbRoot, "runtimes", "windows", "node"),
        (0, node_path_1.join)(usbRoot, "runtimes", "windows", "python"),
        (0, node_path_1.join)(usbRoot, "runtimes", "windows", "git", "cmd"),
    ];
}
