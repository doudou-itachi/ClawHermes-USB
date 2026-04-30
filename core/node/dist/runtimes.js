"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeDiagnostics = runtimeDiagnostics;
exports.loadRuntimeManifest = loadRuntimeManifest;
exports.runtimePreparationPlan = runtimePreparationPlan;
exports.installRuntimeFromArchive = installRuntimeFromArchive;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
function runtimeDiagnostics(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const manifest = loadRuntimeManifest(root);
    return manifest.runtimes.map((runtime) => {
        const resolvedCandidates = runtime.candidates.map((candidate) => (0, portable_1.resolveRelative)(root, candidate));
        const foundPath = resolvedCandidates.find((candidate) => (0, node_fs_1.existsSync)(candidate)) ?? resolvedCandidates[0];
        return {
            name: runtime.name,
            label: runtime.label,
            path: foundPath,
            found: resolvedCandidates.some((candidate) => (0, node_fs_1.existsSync)(candidate)),
            versionPolicy: runtime.versionPolicy,
            packageType: runtime.packageType,
            sourceUrl: runtime.sourceUrl,
            installDir: (0, portable_1.resolveRelative)(root, runtime.installDir),
            candidates: resolvedCandidates,
            notes: runtime.notes,
        };
    });
}
function loadRuntimeManifest(usbRoot) {
    const manifestPath = (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "config", "defaults", "runtimes.json");
    return JSON.parse((0, node_fs_1.readFileSync)(manifestPath, "utf8"));
}
function runtimePreparationPlan(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const manifest = loadRuntimeManifest(root);
    const diagnosticsByName = new Map(runtimeDiagnostics(root).map((runtime) => [runtime.name, runtime]));
    const steps = manifest.runtimes.map((runtime) => {
        const diagnostic = diagnosticsByName.get(runtime.name);
        return {
            name: runtime.name,
            label: runtime.label,
            action: "extract",
            versionPolicy: runtime.versionPolicy,
            packageType: runtime.packageType,
            sourceUrl: runtime.sourceUrl,
            installDir: (0, portable_1.resolveRelative)(root, runtime.installDir),
            expectedExecutables: runtime.candidates.map((candidate) => (0, portable_1.resolveRelative)(root, candidate)),
            notes: runtime.notes,
            found: diagnostic?.found === true,
        };
    });
    const messages = steps.map((step) => {
        if (step.found) {
            return `${step.label} already present under ${step.installDir}.`;
        }
        return `Download ${step.label} from ${step.sourceUrl}, then extract it into ${step.installDir}. Expected executable: ${step.expectedExecutables[0]}.`;
    });
    return {
        root,
        platform: manifest.platform,
        steps,
        messages,
    };
}
function installRuntimeFromArchive(usbRoot, runtimeName, archivePath, dryRun, expectedSha256) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const manifest = loadRuntimeManifest(root);
    const runtime = manifest.runtimes.find((item) => item.name === runtimeName);
    if (!runtime) {
        throw new Error(`Unknown runtime: ${runtimeName}`);
    }
    const archive = (0, node_path_1.resolve)(archivePath);
    if (!(0, node_fs_1.existsSync)(archive)) {
        throw new Error(`Runtime archive not found: ${archive}`);
    }
    if (!archive.toLowerCase().endsWith(".zip")) {
        throw new Error(`Only .zip runtime archives are supported right now: ${archive}`);
    }
    const actualSha256 = sha256File(archive);
    if (expectedSha256 && actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
        throw new Error(`SHA256 mismatch for ${archive}. Expected ${expectedSha256}, got ${actualSha256}.`);
    }
    const installDir = (0, portable_1.resolveRelative)(root, runtime.installDir);
    const expectedExecutables = runtime.candidates.map((candidate) => (0, portable_1.resolveRelative)(root, candidate));
    if (!dryRun) {
        (0, node_fs_1.mkdirSync)(installDir, { recursive: true });
        const tempDir = (0, node_path_1.join)(root, "data", "tmp", "runtime-extract", `${runtime.name}-${Date.now()}`);
        (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        (0, node_fs_1.mkdirSync)(tempDir, { recursive: true });
        try {
            (0, node_child_process_1.execFileSync)("powershell", [
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Expand-Archive",
                "-LiteralPath",
                archive,
                "-DestinationPath",
                tempDir,
                "-Force",
            ], { stdio: "ignore" });
            copyExtractedRuntime(tempDir, installDir);
        }
        finally {
            (0, node_fs_1.rmSync)(tempDir, { recursive: true, force: true });
        }
    }
    const installed = expectedExecutables.some((candidate) => (0, node_fs_1.existsSync)(candidate));
    return {
        runtime: runtime.name,
        dryRun,
        archive,
        installDir,
        expectedExecutables,
        sha256: expectedSha256 ?? null,
        checksumVerified: expectedSha256 ? true : null,
        wouldExtract: true,
        installed,
        message: dryRun
            ? `Would extract ${archive} into ${installDir}.`
            : installed
                ? `Installed ${runtime.label} into ${installDir}.`
                : `Extracted ${archive}, but no expected executable was found under ${installDir}.`,
    };
}
function sha256File(file) {
    const hash = (0, node_crypto_1.createHash)("sha256");
    hash.update((0, node_fs_1.readFileSync)(file));
    return hash.digest("hex");
}
function copyExtractedRuntime(sourceDir, installDir) {
    const entries = (0, node_fs_1.readdirSync)(sourceDir, { withFileTypes: true });
    const contentRoot = entries.length === 1 && entries[0]?.isDirectory()
        ? (0, node_path_1.join)(sourceDir, entries[0].name)
        : sourceDir;
    copyDirectoryContents(contentRoot, installDir);
}
function copyDirectoryContents(sourceDir, targetDir) {
    (0, node_fs_1.mkdirSync)(targetDir, { recursive: true });
    for (const entry of (0, node_fs_1.readdirSync)(sourceDir, { withFileTypes: true })) {
        const source = (0, node_path_1.join)(sourceDir, entry.name);
        const target = (0, node_path_1.join)(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryContents(source, target);
        }
        else if (entry.isFile()) {
            (0, node_fs_1.writeFileSync)(target, (0, node_fs_1.readFileSync)(source));
        }
    }
}
