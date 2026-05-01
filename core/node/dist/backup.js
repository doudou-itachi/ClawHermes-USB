"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBackup = createBackup;
exports.restorePlan = restorePlan;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
function createBackup(usbRoot, options = {}) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const profile = options.profile ?? "data-only";
    const includeLogs = options.includeLogs ?? false;
    const dryRun = options.dryRun ?? false;
    const backupRoot = (0, node_path_1.join)(root, "data", "backups");
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const archivePath = (0, node_path_1.join)(backupRoot, `clawhermes-${profile}-${timestamp}.zip`);
    const entries = backupEntries(root, profile, includeLogs);
    const manifest = {
        createdAt: new Date().toISOString(),
        profile,
        includeLogs,
        entries,
    };
    if (dryRun) {
        return {
            root,
            profile,
            includeLogs,
            dryRun,
            archivePath,
            entries,
            created: false,
            sizeBytes: null,
            message: `Backup dry run planned ${entries.length} entries.`,
        };
    }
    (0, node_fs_1.mkdirSync)(backupRoot, { recursive: true });
    const stagingRoot = (0, node_path_1.join)(root, "data", "tmp", "backups", `stage-${timestamp}`);
    (0, node_fs_1.rmSync)(stagingRoot, { recursive: true, force: true });
    (0, node_fs_1.mkdirSync)(stagingRoot, { recursive: true });
    try {
        for (const entry of entries)
            copyEntry(root, stagingRoot, entry);
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(stagingRoot, "backup-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
        compressDirectory(stagingRoot, archivePath);
    }
    finally {
        (0, node_fs_1.rmSync)(stagingRoot, { recursive: true, force: true });
    }
    return {
        root,
        profile,
        includeLogs,
        dryRun,
        archivePath,
        entries,
        created: true,
        sizeBytes: (0, node_fs_1.statSync)(archivePath).size,
        message: `Created backup archive at ${archivePath}.`,
    };
}
function restorePlan(usbRoot, archivePath) {
    const root = (0, portable_1.getRoot)(usbRoot);
    if (!archivePath)
        throw new Error("--archive is required for restore-plan.");
    if (!(0, node_fs_1.existsSync)(archivePath))
        throw new Error(`Backup archive not found: ${archivePath}`);
    if (!(0, node_fs_1.statSync)(archivePath).isFile())
        throw new Error(`Backup archive is not a file: ${archivePath}`);
    const manifest = readBackupManifest(archivePath);
    const entries = manifest.entries.map((entry) => validateRestoreEntry(entry));
    const conflicts = entries
        .map((entry) => ({ ...entry, targetPath: (0, node_path_1.join)(root, entry.path), targetExists: (0, node_fs_1.existsSync)((0, node_path_1.join)(root, entry.path)) }))
        .filter((entry) => entry.targetExists);
    return {
        root,
        archivePath,
        manifestPath: "backup-manifest.json",
        manifest,
        entries,
        conflicts,
        wouldModify: false,
        confirmCommand: `node core/node/dist/clawhermes.js restore --archive ${quoteCommandArg(archivePath)} --confirm-restore --json`,
        messages: [
            `Backup archive contains ${entries.length} planned restore entries.`,
            conflicts.length > 0
                ? `${conflicts.length} restore target(s) already exist and would require overwrite handling.`
                : "No existing restore targets were detected.",
            "restore-plan is read-only and does not extract files.",
        ],
    };
}
function backupEntries(root, profile, includeLogs) {
    return profile === "full" ? fullBackupEntries(root, includeLogs) : dataOnlyBackupEntries(root, includeLogs);
}
function dataOnlyBackupEntries(root, includeLogs) {
    const candidates = [
        "config",
        "adapters",
        (0, node_path_1.join)("data", "openclaw"),
        (0, node_path_1.join)("data", "hermes"),
        (0, node_path_1.join)("data", "hermes-web-ui"),
        (0, node_path_1.join)("data", "shared-workspace"),
    ];
    if (includeLogs)
        candidates.push((0, node_path_1.join)("data", "logs"));
    return existingEntries(root, candidates);
}
function fullBackupEntries(root, includeLogs) {
    const excluded = new Set([".git", "node_modules"]);
    const entries = [];
    for (const item of (0, node_fs_1.readdirSync)(root, { withFileTypes: true })) {
        if (excluded.has(item.name) || item.name === "data")
            continue;
        entries.push({ path: item.name, kind: item.isDirectory() ? "directory" : "file" });
    }
    const dataItems = (0, node_fs_1.readdirSync)((0, node_path_1.join)(root, "data"), { withFileTypes: true });
    for (const item of dataItems) {
        if (["backups", "cache", "tmp"].includes(item.name))
            continue;
        if (!includeLogs && item.name === "logs")
            continue;
        entries.push({ path: (0, node_path_1.join)("data", item.name), kind: item.isDirectory() ? "directory" : "file" });
    }
    return entries.sort((left, right) => left.path.localeCompare(right.path));
}
function existingEntries(root, candidates) {
    const entries = [];
    for (const relativePath of candidates) {
        const absolutePath = (0, node_path_1.join)(root, relativePath);
        if (!(0, node_fs_1.existsSync)(absolutePath))
            continue;
        entries.push({ path: relativePath, kind: (0, node_fs_1.statSync)(absolutePath).isDirectory() ? "directory" : "file" });
    }
    return entries;
}
function copyEntry(root, stagingRoot, entry) {
    const source = (0, node_path_1.join)(root, entry.path);
    const destination = (0, node_path_1.join)(stagingRoot, entry.path);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(destination), { recursive: true });
    (0, node_fs_1.cpSync)(source, destination, { recursive: entry.kind === "directory", force: true });
}
function compressDirectory(stagingRoot, archivePath) {
    const script = [
        `$staging = ${powershellString(stagingRoot)}`,
        `$archive = ${powershellString(archivePath)}`,
        "if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }",
        "Compress-Archive -Path (Join-Path -Path $staging -ChildPath '*') -DestinationPath $archive -Force",
    ].join("; ");
    (0, node_child_process_1.execFileSync)("powershell", ["-NoProfile", "-Command", script], { stdio: "pipe" });
}
function readBackupManifest(archivePath) {
    const script = [
        "Add-Type -AssemblyName System.IO.Compression.FileSystem",
        `$zip = [System.IO.Compression.ZipFile]::OpenRead(${powershellString(archivePath)})`,
        "try {",
        "  $entry = $zip.GetEntry('backup-manifest.json')",
        "  if ($null -eq $entry) { throw 'backup-manifest.json not found in archive' }",
        "  $stream = $entry.Open()",
        "  try {",
        "    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)",
        "    try { $reader.ReadToEnd() } finally { $reader.Dispose() }",
        "  } finally { $stream.Dispose() }",
        "} finally { $zip.Dispose() }",
    ].join("; ");
    const raw = (0, node_child_process_1.execFileSync)("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 10000 }).trim();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.entries))
        throw new Error("Backup manifest entries are missing or invalid.");
    return parsed;
}
function validateRestoreEntry(entry) {
    if (!entry || typeof entry.path !== "string")
        throw new Error("Backup manifest contains an invalid entry path.");
    if (entry.kind !== "directory" && entry.kind !== "file")
        throw new Error(`Backup manifest contains an invalid entry kind for ${entry.path}.`);
    const normalized = (0, node_path_1.normalize)(entry.path);
    if ((0, node_path_1.isAbsolute)(entry.path) || normalized === ".." || normalized.startsWith(`..\\`) || normalized.startsWith("../")) {
        throw new Error(`Backup manifest contains an unsafe restore path: ${entry.path}`);
    }
    return { path: normalized, kind: entry.kind };
}
function quoteCommandArg(value) {
    return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}
function powershellString(value) {
    return `'${value.replaceAll("'", "''")}'`;
}
