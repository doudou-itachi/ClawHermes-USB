"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payloadInventory = payloadInventory;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const portable_1 = require("./portable");
const wsl_import_1 = require("./wsl-import");
function payloadInventory(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapters = (0, adapters_1.loadAdapters)(root);
    const sourceDistros = [...new Set(adapters
            .filter((adapter) => adapter.runtime?.kind === "wsl2")
            .map((adapter) => adapter.runtime?.sourceDistro?.trim() || adapter.runtime?.distro?.trim() || "Ubuntu"))];
    return {
        root,
        generatedAt: new Date().toISOString(),
        wouldModify: false,
        apps: adapters.map((adapter) => appPayload(root, adapter.id, adapter.appDir)),
        wslRootfs: sourceDistros.map((distro) => {
            const plan = (0, wsl_import_1.wslImportPlan)(root, { distro });
            return {
                distro,
                distributionName: plan.distributionName,
                importLocation: plan.installLocation,
                archive: filePayload(plan.sourceArchive),
            };
        }),
        wslBackups: sourceDistros.map((distro) => {
            const distributionName = `ClawHermes-${safeDistributionSuffix(distro)}`;
            return {
                distro,
                distributionName,
                latest: latestWslBackup(root, distributionName),
            };
        }),
        policy: {
            appsIgnored: "apps/<service-id>/ payloads are ignored except .gitkeep placeholders.",
            rootfsIgnored: "runtimes/wsl/*.tar and sidecars are ignored operator-managed payloads.",
            backupsIgnored: "data/backups/wsl/ exports are ignored runtime artifacts.",
            noAutomaticDownload: true,
        },
        messages: [
            "payloads is read-only and does not download, export, import, or package artifacts.",
            "Use this inventory before building or refreshing a portable payload bundle.",
        ],
    };
}
function appPayload(root, serviceId, appDir) {
    const absolutePath = (0, node_path_1.join)(root, appDir);
    const exists = (0, node_fs_1.existsSync)(absolutePath);
    const entries = exists ? (0, node_fs_1.readdirSync)(absolutePath).filter((name) => name !== ".gitkeep") : [];
    const git = exists && (0, node_fs_1.existsSync)((0, node_path_1.join)(absolutePath, ".git")) ? gitSummary(absolutePath) : null;
    return {
        serviceId,
        path: absolutePath,
        exists,
        ready: entries.length > 0,
        entries: entries.length,
        git,
    };
}
function filePayload(path) {
    const sidecarPath = `${path}.sha256`;
    const exists = (0, node_fs_1.existsSync)(path);
    const sidecarExists = (0, node_fs_1.existsSync)(sidecarPath);
    return {
        path,
        exists,
        sizeBytes: exists ? (0, node_fs_1.statSync)(path).size : null,
        sha256Sidecar: {
            path: sidecarPath,
            exists: sidecarExists,
            value: sidecarExists ? parseSha256((0, node_fs_1.readFileSync)(sidecarPath, "utf8")) : null,
        },
    };
}
function latestWslBackup(root, distributionName) {
    const backupRoot = (0, node_path_1.join)(root, "data", "backups", "wsl");
    if (!(0, node_fs_1.existsSync)(backupRoot))
        return null;
    const prefix = `${distributionName}-`;
    const latest = (0, node_fs_1.readdirSync)(backupRoot)
        .filter((name) => name.startsWith(prefix) && name.endsWith(".tar"))
        .sort()
        .at(-1);
    return latest ? filePayload((0, node_path_1.join)(backupRoot, latest)) : null;
}
function gitSummary(cwd) {
    try {
        const head = (0, node_child_process_1.execFileSync)("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 5000 }).trim();
        const status = (0, node_child_process_1.execFileSync)("git", ["status", "--short"], { cwd, encoding: "utf8", timeout: 5000 }).trim();
        return {
            head,
            dirty: status.length > 0,
            statusLines: status ? status.split(/\r?\n/) : [],
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            head: null,
            dirty: null,
            statusLines: [],
            error: message,
        };
    }
}
function parseSha256(value) {
    const match = value.match(/[A-Fa-f0-9]{64}/);
    return match ? match[0].toLowerCase() : null;
}
function safeDistributionSuffix(value) {
    return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Ubuntu";
}
