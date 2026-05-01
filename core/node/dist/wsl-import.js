"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslImportPlan = wslImportPlan;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
const WSL_COMMAND_DOCS = "https://learn.microsoft.com/en-us/windows/wsl/basic-commands";
function wslImportPlan(usbRoot, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const distro = normalizeDistro(options.distro) ?? "Ubuntu";
    const distributionName = `ClawHermes-${safeDistributionSuffix(distro)}`;
    const installLocation = (0, node_path_1.join)(root, "data", "wsl", distributionName);
    const sourceArchive = (0, node_path_1.join)(root, "runtimes", "wsl", `${distro.toLowerCase()}-rootfs.tar`);
    const args = ["--import", distributionName, installLocation, sourceArchive, "--version", "2"];
    return {
        root,
        distro,
        distributionName,
        installLocation,
        sourceArchive,
        sourceArchiveExists: (0, node_fs_1.existsSync)(sourceArchive),
        dryRun: true,
        executed: false,
        wouldModifyHost: true,
        wouldUseProjectStorage: true,
        executablePath: "wsl.exe",
        args,
        command: ["wsl.exe", ...args.map(quoteCommandArg)].join(" "),
        docs: WSL_COMMAND_DOCS,
        messages: [
            `This plan stores the imported distribution files under the project path: ${installLocation}.`,
            `The distribution name ${distributionName} is still registered on this Windows host.`,
            `Place a compatible rootfs tar archive at ${sourceArchive} before running the import command yourself.`,
            "This command is read-only and does not run wsl.exe.",
        ],
    };
}
function normalizeDistro(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}
function safeDistributionSuffix(value) {
    return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Ubuntu";
}
function quoteCommandArg(value) {
    return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}
