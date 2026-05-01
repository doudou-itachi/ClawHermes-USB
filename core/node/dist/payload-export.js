"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payloadExport = payloadExport;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_child_process_1 = require("node:child_process");
const adapters_1 = require("./adapters");
const portable_1 = require("./portable");
const payloads_1 = require("./payloads");
function payloadExport(usbRoot, options = {}) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const dryRun = options.dryRun ?? false;
    const archivePath = options.archive?.trim() ? (0, node_path_1.resolve)(options.archive) : defaultArchivePath(root);
    const entries = payloadEntries(root);
    const manifest = {
        createdAt: new Date().toISOString(),
        root,
        profile: "payloads",
        entries,
        policy: (0, payloads_1.payloadInventory)(root).policy,
    };
    const result = {
        root,
        dryRun,
        confirmedExport: options.confirmExport === true,
        archivePath,
        created: false,
        sizeBytes: null,
        entries,
        wouldModify: !dryRun,
        messages: [
            dryRun
                ? `Payload export dry run planned ${entries.length} entries.`
                : `Prepared payload export with ${entries.length} entries.`,
        ],
    };
    if (dryRun)
        return result;
    if (!options.confirmExport) {
        throw new Error("payload-export writes a payload archive. Re-run with --confirm-export to proceed.");
    }
    if (isUnderSystemTempOutsideRoot(archivePath, root)) {
        throw new Error(`Refusing to write payload export archive under system temp: ${archivePath}`);
    }
    const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const stagingRoot = (0, node_path_1.join)(root, "data", "tmp", "payload-export", `stage-${timestamp}`);
    (0, node_fs_1.rmSync)(stagingRoot, { recursive: true, force: true });
    (0, node_fs_1.mkdirSync)(stagingRoot, { recursive: true });
    try {
        for (const entry of entries)
            copyEntry(root, stagingRoot, entry);
        (0, node_fs_1.writeFileSync)((0, node_path_1.join)(stagingRoot, "payload-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(archivePath), { recursive: true });
        compressDirectory(stagingRoot, archivePath);
    }
    finally {
        (0, node_fs_1.rmSync)((0, node_path_1.join)(root, "data", "tmp", "payload-export"), { recursive: true, force: true });
    }
    return {
        ...result,
        created: true,
        sizeBytes: (0, node_fs_1.statSync)(archivePath).size,
        messages: [`Created payload export archive at ${archivePath}.`],
    };
}
function payloadEntries(root) {
    const entries = [];
    for (const adapter of (0, adapters_1.loadAdapters)(root)) {
        const appDir = (0, portable_1.resolveRelative)(root, adapter.appDir);
        if ((0, node_fs_1.existsSync)(appDir) && directoryHasPayload(appDir)) {
            entries.push({ path: normalizeRelative(adapter.appDir), kind: "directory", sizeBytes: null });
        }
    }
    const inventory = (0, payloads_1.payloadInventory)(root);
    for (const item of inventory.wslRootfs) {
        pushFile(entries, root, item.archive.path);
        if (item.archive.sha256Sidecar.exists)
            pushFile(entries, root, item.archive.sha256Sidecar.path);
    }
    for (const item of inventory.wslBackups) {
        if (!item.latest)
            continue;
        pushFile(entries, root, item.latest.path);
        if (item.latest.sha256Sidecar.exists)
            pushFile(entries, root, item.latest.sha256Sidecar.path);
    }
    return dedupeEntries(entries).filter((entry) => !entry.path.replaceAll("\\", "/").startsWith("data/tmp"));
}
function pushFile(entries, root, absolutePath) {
    if (!(0, node_fs_1.existsSync)(absolutePath))
        return;
    entries.push({
        path: relativeToRoot(root, absolutePath),
        kind: "file",
        sizeBytes: (0, node_fs_1.statSync)(absolutePath).size,
    });
}
function copyEntry(root, stagingRoot, entry) {
    const source = (0, portable_1.resolveRelative)(root, entry.path);
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
function directoryHasPayload(path) {
    return (0, node_fs_1.existsSync)(path) && (0, node_fs_1.statSync)(path).isDirectory();
}
function dedupeEntries(entries) {
    const seen = new Set();
    return entries.filter((entry) => {
        const key = entry.path.replaceAll("\\", "/").toLowerCase();
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
function relativeToRoot(root, absolutePath) {
    const relative = (0, node_path_1.resolve)(absolutePath).slice((0, node_path_1.resolve)(root).length).replace(/^[\\/]+/, "");
    return normalizeRelative(relative);
}
function normalizeRelative(value) {
    return value.replaceAll("\\", "/");
}
function defaultArchivePath(root) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return (0, node_path_1.join)(root, "data", "backups", "payloads", `clawhermes-payloads-${timestamp}.zip`);
}
function isUnderSystemTempOutsideRoot(path, root) {
    const temp = (0, node_path_1.resolve)((0, node_os_1.tmpdir)()).toLowerCase();
    const target = (0, node_path_1.resolve)(path).toLowerCase();
    const projectRoot = (0, node_path_1.resolve)(root).toLowerCase();
    const underRoot = target === projectRoot || target.startsWith(`${projectRoot}\\`) || target.startsWith(`${projectRoot}/`);
    const underTemp = target === temp || target.startsWith(`${temp}\\`) || target.startsWith(`${temp}/`);
    return underTemp && !underRoot;
}
function powershellString(value) {
    return `'${value.replaceAll("'", "''")}'`;
}
