"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslDiagnostics = wslDiagnostics;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const portable_1 = require("./portable");
function wslDiagnostics(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const executablePath = resolveWslExecutable();
    if (!executablePath) {
        return {
            root,
            executablePath: process.env.CLAWHERMES_WSL_EXE ?? null,
            found: false,
            statusSucceeded: false,
            statusText: null,
            listSucceeded: false,
            listText: null,
            distros: [],
            defaultDistro: null,
            hasWsl2Distro: false,
            messages: ["wsl.exe not found. Install or enable WSL2 before running WSL2 adapters."],
        };
    }
    const status = runWslCommand(executablePath, ["--status"]);
    const list = runWslCommand(executablePath, ["--list", "--verbose"]);
    const distros = list.ok ? parseWslList(list.output) : [];
    const defaultDistro = distros.find((distro) => distro.default)?.name ?? null;
    const hasWsl2Distro = distros.some((distro) => distro.version === 2);
    const messages = [];
    if (!status.ok)
        messages.push(`wsl.exe --status failed: ${status.output}`);
    if (!list.ok)
        messages.push(`wsl.exe --list --verbose failed: ${list.output}`);
    if (list.ok && distros.length === 0)
        messages.push("No WSL distributions are registered.");
    if (distros.length > 0 && !hasWsl2Distro)
        messages.push("No registered WSL2 distribution was detected.");
    if (messages.length === 0)
        messages.push("WSL2 host diagnostics passed.");
    return {
        root,
        executablePath,
        found: true,
        statusSucceeded: status.ok,
        statusText: status.output,
        listSucceeded: list.ok,
        listText: list.output,
        distros,
        defaultDistro,
        hasWsl2Distro,
        messages,
    };
}
function resolveWslExecutable() {
    const override = process.env.CLAWHERMES_WSL_EXE;
    if (override)
        return (0, node_fs_1.existsSync)(override) ? override : null;
    try {
        const output = (0, node_child_process_1.execFileSync)("where.exe", ["wsl.exe"], { encoding: "utf8", timeout: 3000 }).trim();
        return output.split(/\r?\n/).find((line) => line.trim().length > 0) ?? null;
    }
    catch {
        return null;
    }
}
function runWslCommand(executablePath, args) {
    try {
        return {
            ok: true,
            output: decodeCommandOutput((0, node_child_process_1.execFileSync)(executablePath, args, { stdio: ["ignore", "pipe", "pipe"], timeout: 5000, windowsHide: true })).trim(),
        };
    }
    catch (error) {
        const failure = error;
        const output = `${decodeCommandOutput(failure.stdout)}\n${decodeCommandOutput(failure.stderr)}`.trim();
        return { ok: false, output: normalizeWslFailure(output || failure.message || "unknown error") };
    }
}
function decodeCommandOutput(value) {
    if (!value)
        return "";
    if (typeof value === "string")
        return value;
    const sampleLength = Math.min(value.length, 200);
    let nulCount = 0;
    for (let index = 0; index < sampleLength; index += 1) {
        if (value[index] === 0)
            nulCount += 1;
    }
    const decoded = nulCount > sampleLength / 4 ? value.toString("utf16le") : value.toString("utf8");
    return decoded.replace(/\u0000/g, "");
}
function normalizeWslFailure(output) {
    if (output.includes("aka.ms/wslinstall") || output.includes("wsl.exe --install")) {
        return "WSL is present as a host command, but no Linux distribution is installed. Run wsl.exe --install, then rerun this diagnostic. See https://aka.ms/wslinstall.";
    }
    return output;
}
function parseWslList(output) {
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines
        .filter((line) => !/^NAME\s+STATE\s+VERSION$/i.test(line))
        .map((line) => {
        const defaultDistro = line.startsWith("*");
        const normalized = line.replace(/^\*\s*/, "");
        const match = normalized.match(/^(.+?)\s{2,}(\S+)\s+(\d+)$/);
        if (!match) {
            return { name: normalized, state: null, version: null, default: defaultDistro };
        }
        return {
            name: match[1].trim(),
            state: match[2],
            version: Number(match[3]),
            default: defaultDistro,
        };
    });
}
