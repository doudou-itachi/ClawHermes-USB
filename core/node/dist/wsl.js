"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslDiagnostics = wslDiagnostics;
exports.prepareWsl = prepareWsl;
exports.wslExecutableInvocation = wslExecutableInvocation;
exports.resolveWslExecutable = resolveWslExecutable;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
const WSL_INSTALL_DOCS = "https://learn.microsoft.com/en-us/windows/wsl/install";
const WSL_COMMAND_DOCS = "https://learn.microsoft.com/en-us/windows/wsl/basic-commands";
function wslDiagnostics(usbRoot, desiredDistro, options = {}) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const targetDistro = normalizeDesiredDistro(desiredDistro);
    const commandTimeoutMs = options.commandTimeoutMs ?? 5000;
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
            desiredDistro: targetDistro,
            hasDesiredDistro: false,
            desiredDistroVersion: null,
            messages: ["wsl.exe not found. Install or enable WSL2 before running WSL2 adapters."],
        };
    }
    const status = runWslCommand(executablePath, ["--status"], commandTimeoutMs);
    const list = runWslCommand(executablePath, ["--list", "--verbose"], commandTimeoutMs);
    const distros = list.ok ? parseWslList(list.output) : [];
    const defaultDistro = distros.find((distro) => distro.default)?.name ?? null;
    const hasWsl2Distro = distros.some((distro) => distro.version === 2);
    const desired = targetDistro ? distros.find((distro) => distro.name.toLowerCase() === targetDistro.toLowerCase()) ?? null : null;
    const messages = [];
    if (!status.ok)
        messages.push(`wsl.exe --status failed: ${status.output}`);
    if (!list.ok)
        messages.push(`wsl.exe --list --verbose failed: ${list.output}`);
    if (list.ok && distros.length === 0)
        messages.push("No WSL distributions are registered.");
    if (distros.length > 0 && !hasWsl2Distro)
        messages.push("No registered WSL2 distribution was detected.");
    if (targetDistro && list.ok && !desired)
        messages.push(`Target WSL distribution is not registered: ${targetDistro}.`);
    if (desired && desired.version !== 2)
        messages.push(`Target WSL distribution ${targetDistro} is version ${desired.version ?? "unknown"}, not WSL2.`);
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
        desiredDistro: targetDistro,
        hasDesiredDistro: desired !== null,
        desiredDistroVersion: desired?.version ?? null,
        messages,
    };
}
function prepareWsl(usbRoot, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const distro = normalizeDesiredDistro(options.distro) ?? "Ubuntu";
    const diagnostics = wslDiagnostics(root, distro);
    const commands = preparationCommands(diagnostics, distro);
    const portableImport = {
        automatic: false,
        supported: true,
        installLocation: (0, node_path_1.join)(root, "data", "wsl", `ClawHermes-${distro}`),
        sourceArchive: (0, node_path_1.join)(root, "runtimes", "wsl", `${distro.toLowerCase()}-rootfs.tar`),
        summary: "wsl --import can place distro files under the USB/project path, but the distro is still registered on the current Windows host.",
        exampleArgs: ["--import", `ClawHermes-${distro}`, (0, node_path_1.join)(root, "data", "wsl", `ClawHermes-${distro}`), (0, node_path_1.join)(root, "runtimes", "wsl", `${distro.toLowerCase()}-rootfs.tar`), "--version", "2"],
        docs: WSL_COMMAND_DOCS,
    };
    const hostChanges = [
        "WSL2 enablement and Linux distribution registration are host-level Windows changes, not fully portable USB state.",
        "The install flow may require administrator approval, network access, first-run Linux user initialization, and a Windows restart.",
        "ClawHermes-USB will not run these commands unless --confirm-install is provided.",
    ];
    const wouldModifyHost = commands.length > 0;
    const messages = commands.length === 0
        ? [`WSL2 target distribution is already ready: ${distro}.`]
        : [`WSL2 preparation is required for target distribution: ${distro}.`];
    const result = {
        root,
        distro,
        dryRun: options.dryRun,
        confirmedInstall: options.confirmInstall,
        diagnostics,
        wouldModifyHost,
        hostChanges,
        commands,
        portableImport,
        executed: false,
        messages,
    };
    if (options.dryRun || commands.length === 0)
        return result;
    if (!options.confirmInstall) {
        throw new Error("prepare-wsl modifies the Windows host. Re-run with --confirm-install to proceed.");
    }
    for (const command of commands) {
        (0, node_child_process_1.execFileSync)(command.executablePath, command.args, { stdio: "inherit", windowsHide: true });
    }
    return { ...result, executed: true };
}
function wslExecutableInvocation(executablePath, args) {
    if (/\.(cmd|bat)$/i.test(executablePath)) {
        return {
            executablePath: "cmd.exe",
            args: ["/d", "/s", "/c", windowsCommandLine(executablePath, args)],
        };
    }
    return { executablePath, args };
}
function preparationCommands(diagnostics, distro) {
    const executablePath = diagnostics.executablePath ?? "wsl.exe";
    const desired = diagnostics.distros.find((item) => item.name.toLowerCase() === distro.toLowerCase()) ?? null;
    if (!desired) {
        const args = ["--install", "-d", distro];
        return [{
                id: "install-distro",
                description: `Install WSL2 and the ${distro} distribution on this Windows host.`,
                executablePath,
                args,
                commandLine: commandLine(executablePath, args),
                modifiesHost: true,
                requiresUserConsent: true,
                mayRequireAdmin: true,
                mayRequireReboot: true,
                docs: WSL_INSTALL_DOCS,
            }];
    }
    if (desired.version !== 2) {
        const args = ["--set-version", distro, "2"];
        return [{
                id: "convert-distro",
                description: `Convert the ${distro} distribution to WSL2 on this Windows host.`,
                executablePath,
                args,
                commandLine: commandLine(executablePath, args),
                modifiesHost: true,
                requiresUserConsent: true,
                mayRequireAdmin: false,
                mayRequireReboot: false,
                docs: WSL_COMMAND_DOCS,
            }];
    }
    return [];
}
function commandLine(executablePath, args) {
    return [executablePath, ...args].map(quoteCommandArg).join(" ");
}
function quoteCommandArg(value) {
    return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}
function windowsCommandLine(executablePath, args) {
    return [executablePath, ...args.map(quoteWindowsCommandArg)].join(" ");
}
function quoteWindowsCommandArg(value) {
    return /[\s&|<>^]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
function normalizeDesiredDistro(value) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
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
function runWslCommand(executablePath, args, timeoutMs) {
    const invocation = wslExecutableInvocation(executablePath, args);
    try {
        return {
            ok: true,
            output: decodeCommandOutput((0, node_child_process_1.execFileSync)(invocation.executablePath, invocation.args, { stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs, windowsHide: true })).trim(),
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
