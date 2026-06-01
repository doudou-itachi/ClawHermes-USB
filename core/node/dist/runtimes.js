"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeDiagnostics = runtimeDiagnostics;
exports.adapterRuntimeRequirementDiagnostics = adapterRuntimeRequirementDiagnostics;
exports.loadRuntimeManifest = loadRuntimeManifest;
exports.runtimePreparationPlan = runtimePreparationPlan;
exports.installRuntimeFromArchive = installRuntimeFromArchive;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const portable_1 = require("./portable");
const platform_1 = require("./platform");
function runtimeDiagnostics(usbRoot, probe = {}) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const manifest = loadRuntimeManifest(root);
    return manifest.runtimes.map((item) => {
        const runtime = resolveRuntimeForPlatform(item, probe);
        const resolvedCandidates = runtime.candidates.map((candidate) => (0, portable_1.resolveRelative)(root, candidate));
        const foundPath = resolvedCandidates.find((candidate) => (0, node_fs_1.existsSync)(candidate)) ?? resolvedCandidates[0];
        const found = resolvedCandidates.some((candidate) => (0, node_fs_1.existsSync)(candidate));
        return {
            name: runtime.name,
            label: runtime.label,
            path: foundPath,
            found,
            version: found ? runtimeVersion(foundPath) : null,
            versionPolicy: runtime.versionPolicy,
            packageType: runtime.packageType,
            sourceUrl: runtime.sourceUrl,
            installDir: (0, portable_1.resolveRelative)(root, runtime.installDir),
            candidates: resolvedCandidates,
            notes: runtime.notes,
        };
    });
}
function adapterRuntimeRequirementDiagnostics(usbRoot, adapters, probe = {}) {
    const runtimes = new Map(runtimeDiagnostics(usbRoot, probe).map((runtime) => [runtime.name, runtime]));
    return adapters
        .filter((adapter) => adapter.runtime)
        .map((adapter) => {
        const runtime = adapter.runtime;
        const diagnostic = runtimes.get(runtime.kind);
        const versionRequirement = runtime.versionRequirement ?? null;
        const satisfies = versionRequirement && diagnostic?.version
            ? satisfiesVersionRequirement(diagnostic.version, versionRequirement)
            : versionRequirement
                ? false
                : null;
        return {
            serviceId: adapter.id,
            runtime: runtime.kind,
            requiredExecutable: runtime.requiredExecutable,
            versionRequirement,
            executablePath: diagnostic?.path ?? null,
            found: diagnostic?.found === true,
            version: diagnostic?.version ?? null,
            satisfies,
            message: runtimeRequirementMessage(adapter.id, runtime.kind, diagnostic?.version ?? null, versionRequirement, satisfies),
        };
    });
}
function loadRuntimeManifest(usbRoot) {
    const manifestPath = (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "config", "defaults", "runtimes.json");
    return JSON.parse((0, node_fs_1.readFileSync)(manifestPath, "utf8"));
}
function runtimePreparationPlan(usbRoot, probe = {}) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const manifest = loadRuntimeManifest(root);
    const adapters = (0, adapters_1.loadAdapters)(root);
    const diagnosticsByName = new Map(runtimeDiagnostics(root, probe).map((runtime) => [runtime.name, runtime]));
    const adapterRuntimeRequirements = adapterRuntimeRequirementDiagnostics(root, adapters, probe);
    const steps = manifest.runtimes.map((item) => {
        const runtime = resolveRuntimeForPlatform(item, probe);
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
        adapterRuntimeRequirements,
        messages,
    };
}
function installRuntimeFromArchive(usbRoot, runtimeName, archivePath, dryRun, expectedSha256, probe = {}) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const manifest = loadRuntimeManifest(root);
    const manifestRuntime = manifest.runtimes.find((item) => item.name === runtimeName);
    if (!manifestRuntime) {
        throw new Error(`Unknown runtime: ${runtimeName}`);
    }
    const runtime = resolveRuntimeForPlatform(manifestRuntime, probe);
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
function resolveRuntimeForPlatform(runtime, probe) {
    const platform = (0, platform_1.detectPlatform)(probe);
    const override = runtime.platforms?.[platform.runtimeKey];
    if (!override)
        return runtime;
    return {
        ...runtime,
        ...override,
        platforms: runtime.platforms,
    };
}
function sha256File(file) {
    const hash = (0, node_crypto_1.createHash)("sha256");
    hash.update((0, node_fs_1.readFileSync)(file));
    return hash.digest("hex");
}
function runtimeVersion(executablePath) {
    try {
        const output = (0, node_child_process_1.execFileSync)(executablePath, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
        return output.replace(/^v/i, "");
    }
    catch {
        return null;
    }
}
function satisfiesVersionRequirement(version, requirement) {
    const match = requirement.trim().match(/^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match)
        return false;
    return compareVersions(version, [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]) >= 0;
}
function compareVersions(version, required) {
    const match = version.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    const actual = match
        ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
        : [0, 0, 0];
    for (let index = 0; index < 3; index += 1) {
        if (actual[index] !== required[index])
            return actual[index] - required[index];
    }
    return 0;
}
function runtimeRequirementMessage(serviceId, runtime, version, requirement, satisfies) {
    if (!requirement)
        return `Adapter ${serviceId} does not declare a ${runtime} version requirement.`;
    if (!version)
        return `Adapter ${serviceId} requires ${runtime} ${requirement}, but no installed version was detected.`;
    if (satisfies)
        return `Adapter ${serviceId} requires ${runtime} ${requirement}; installed version ${version} satisfies it.`;
    return `Adapter ${serviceId} requires ${runtime} ${requirement}; installed version ${version} does not satisfy it.`;
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
