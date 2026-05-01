"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslImportPlan = wslImportPlan;
exports.wslRootfsGuide = wslRootfsGuide;
exports.wslImport = wslImport;
exports.wslUnregisterPlan = wslUnregisterPlan;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
const wsl_1 = require("./wsl");
const WSL_COMMAND_DOCS = "https://learn.microsoft.com/en-us/windows/wsl/basic-commands";
function wslImportPlan(usbRoot, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const distro = normalizeDistro(options.distro) ?? "Ubuntu";
    const distributionName = `ClawHermes-${safeDistributionSuffix(distro)}`;
    const installLocation = (0, node_path_1.join)(root, "data", "wsl", distributionName);
    const artifactDirectory = (0, node_path_1.join)(root, "runtimes", "wsl");
    const archiveName = `${distro.toLowerCase()}-rootfs.tar`;
    const sourceArchive = (0, node_path_1.join)(artifactDirectory, archiveName);
    const checksumFile = `${sourceArchive}.sha256`;
    const args = ["--import", distributionName, installLocation, sourceArchive, "--version", "2"];
    const checksum = checksumStatus(sourceArchive, checksumFile);
    return {
        root,
        distro,
        distributionName,
        installLocation,
        installLocationExists: (0, node_fs_1.existsSync)(installLocation),
        sourceArchive,
        sourceArchiveExists: (0, node_fs_1.existsSync)(sourceArchive),
        checksum,
        artifactPolicy: {
            directory: artifactDirectory,
            archiveName,
            checksumFile,
            automaticDownload: false,
            managedBy: "operator",
            allowedFileTypes: [".tar"],
            mustRemainProjectLocal: true,
            mustNotUseSystemTemp: true,
        },
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
            `Place the matching SHA256 file at ${checksumFile} when one is available from the artifact source.`,
            "No automatic rootfs download is performed; keep large rootfs artifacts out of git and outside system temp folders.",
            "This command is read-only and does not run wsl.exe.",
        ],
    };
}
function wslRootfsGuide(usbRoot, options) {
    const plan = wslImportPlan(usbRoot, options);
    const archivePath = plan.sourceArchive;
    const checksumPath = plan.checksum.path;
    return {
        root: plan.root,
        distro: plan.distro,
        archivePath,
        checksumPath,
        automaticDownload: false,
        sourceStrategy: "manual-export",
        exportCommand: `wsl.exe --export ${plan.distro} ${quoteCommandArg(archivePath)}`,
        checksumCommand: `Get-FileHash -Algorithm SHA256 -LiteralPath ${quotePowerShellArg(archivePath)} | ForEach-Object { "$($_.Hash.ToLowerInvariant())  ${plan.artifactPolicy.archiveName}" } | Set-Content -Encoding UTF8 -LiteralPath ${quotePowerShellArg(checksumPath)}`,
        nextCommands: [
            `node core/node/dist/clawhermes.js wsl-import-plan --distro ${plan.distro} --json`,
            `node core/node/dist/clawhermes.js wsl-import --distro ${plan.distro} --confirm-import --json`,
        ],
        docs: WSL_COMMAND_DOCS,
        messages: [
            "ClawHermes-USB does not download, build, or vendor WSL rootfs archives.",
            `Export a user-managed, initialized ${plan.distro} distribution to ${archivePath}.`,
            `Create a SHA256 sidecar at ${checksumPath} before importing when possible.`,
            "Keep the archive under runtimes/wsl/ and outside system temp folders.",
        ],
    };
}
function wslImport(usbRoot, options) {
    const plan = wslImportPlan(usbRoot, options);
    const result = {
        ...plan,
        dryRun: false,
        confirmedImport: options.confirmImport,
        executed: false,
        stdout: "",
        stderr: "",
    };
    if (!options.confirmImport) {
        throw new Error("wsl-import modifies the current Windows host. Re-run with --confirm-import to proceed.");
    }
    if (!plan.sourceArchiveExists) {
        throw new Error(`Missing WSL rootfs archive: ${plan.sourceArchive}`);
    }
    if (plan.installLocationExists) {
        throw new Error(`WSL install location already exists: ${plan.installLocation}`);
    }
    if (plan.checksum.exists && !plan.checksum.verified) {
        throw new Error(`SHA256 mismatch for WSL rootfs archive: expected ${plan.checksum.expected}, got ${plan.checksum.actual}`);
    }
    const executablePath = (0, wsl_1.resolveWslExecutable)();
    if (!executablePath) {
        throw new Error("wsl.exe not found. Install or enable WSL2 before importing a distribution.");
    }
    const diagnostics = (0, wsl_1.wslDiagnostics)(plan.root);
    const registered = diagnostics.distros.find((item) => item.name.toLowerCase() === plan.distributionName.toLowerCase());
    if (diagnostics.listSucceeded && registered) {
        throw new Error(`WSL distribution is already registered: ${plan.distributionName}`);
    }
    const invocation = (0, wsl_1.wslExecutableInvocation)(executablePath, plan.args);
    const stdout = (0, node_child_process_1.execFileSync)(invocation.executablePath, invocation.args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    return {
        ...result,
        executablePath,
        executed: true,
        stdout: stdout.trim(),
        messages: [
            ...plan.messages,
            `Executed WSL import for ${plan.distributionName}.`,
        ],
    };
}
function wslUnregisterPlan(usbRoot, options) {
    const plan = wslImportPlan(usbRoot, options);
    const diagnostics = (0, wsl_1.wslDiagnostics)(plan.root);
    const registered = diagnostics.distros.some((item) => item.name.toLowerCase() === plan.distributionName.toLowerCase());
    const backupArchive = (0, node_path_1.join)(plan.root, "data", "backups", "wsl", `${plan.distributionName}-backup.tar`);
    const args = ["--unregister", plan.distributionName];
    return {
        root: plan.root,
        distro: plan.distro,
        distributionName: plan.distributionName,
        registered,
        diagnostics,
        backupArchive,
        backupCommand: `wsl.exe --export ${plan.distributionName} ${quoteCommandArg(backupArchive)}`,
        dryRun: true,
        executed: false,
        wouldModifyHost: true,
        destructive: true,
        executablePath: "wsl.exe",
        args,
        command: ["wsl.exe", ...args.map(quoteCommandArg)].join(" "),
        confirmCommand: `node core/node/dist/clawhermes.js wsl-unregister --distro ${plan.distro} --confirm-unregister --json`,
        docs: WSL_COMMAND_DOCS,
        warnings: [
            `Unregistering ${plan.distributionName} permanently deletes that WSL distribution and its Linux filesystem from this Windows host.`,
            `Export a backup first with: wsl.exe --export ${plan.distributionName} ${quoteCommandArg(backupArchive)}`,
            "This command is read-only and does not run wsl.exe.",
        ],
        messages: registered
            ? [`Distribution is registered on this host: ${plan.distributionName}.`]
            : [`Distribution is not registered on this host: ${plan.distributionName}.`],
    };
}
function checksumStatus(sourceArchive, checksumFile) {
    if (!(0, node_fs_1.existsSync)(checksumFile)) {
        return {
            path: checksumFile,
            exists: false,
            expected: null,
            actual: null,
            verified: false,
        };
    }
    const expected = parseExpectedSha256((0, node_fs_1.readFileSync)(checksumFile, "utf8"));
    const actual = (0, node_fs_1.existsSync)(sourceArchive) ? sha256File(sourceArchive) : null;
    return {
        path: checksumFile,
        exists: true,
        expected,
        actual,
        verified: expected !== null && actual !== null && expected.toLowerCase() === actual.toLowerCase(),
    };
}
function parseExpectedSha256(value) {
    const match = value.match(/[A-Fa-f0-9]{64}/);
    return match ? match[0].toLowerCase() : null;
}
function sha256File(path) {
    return (0, node_crypto_1.createHash)("sha256").update((0, node_fs_1.readFileSync)(path)).digest("hex");
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
function quotePowerShellArg(value) {
    return `'${value.replaceAll("'", "''")}'`;
}
