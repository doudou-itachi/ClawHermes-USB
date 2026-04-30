"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAdapters = loadAdapters;
exports.validateAdapter = validateAdapter;
exports.integrationReadiness = integrationReadiness;
exports.serviceOrder = serviceOrder;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
function loadAdapters(usbRoot) {
    const adapterRoot = (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "adapters");
    return (0, node_fs_1.readdirSync)(adapterRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => (0, node_path_1.join)(adapterRoot, entry.name, "adapter.json"))
        .filter((file) => (0, node_fs_1.existsSync)(file))
        .map((file) => JSON.parse((0, node_fs_1.readFileSync)(file, "utf8")))
        .sort((a, b) => a.id.localeCompare(b.id));
}
function isRelativePath(value) {
    return !value || !(0, node_path_1.isAbsolute)(value);
}
function validateAdapter(adapter, knownIds) {
    const errors = [];
    if (!adapter.id)
        errors.push("id is required");
    if (!isRelativePath(adapter.appDir))
        errors.push("appDir must be relative");
    if (!isRelativePath(adapter.dataDir))
        errors.push("dataDir must be relative");
    if (!isRelativePath(adapter.logFile))
        errors.push("logFile must be relative");
    if (adapter.logFile && !adapter.logFile.replaceAll("\\", "/").startsWith("data/logs/")) {
        errors.push("logFile must be under data/logs");
    }
    if (!isRelativePath(adapter.pidFile))
        errors.push("pidFile must be relative");
    if (adapter.pidFile && !adapter.pidFile.replaceAll("\\", "/").startsWith("data/tmp/")) {
        errors.push("pidFile must be under data/tmp");
    }
    if (!adapter.health)
        errors.push("health is required");
    for (const dependency of adapter.dependsOn ?? []) {
        if (!knownIds.includes(dependency))
            errors.push(`dependsOn references unknown service: ${dependency}`);
    }
    return { id: adapter.id, valid: errors.length === 0, errors };
}
function integrationReadiness(adapters) {
    return adapters.map((adapter) => ({
        id: adapter.id,
        status: adapter.integration?.status ?? "unknown",
        productionReady: adapter.integration?.productionReady === true,
        verifiedAt: adapter.integration?.verifiedAt ?? null,
        summary: adapter.integration?.summary ?? "No upstream integration metadata has been recorded for this adapter.",
        sources: adapter.integration?.sources ?? [],
    }));
}
function serviceOrder(usbRoot, order) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapters = loadAdapters(root);
    const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
    const configPath = (0, node_path_1.join)(root, "config", "defaults", "services.json");
    const ordered = [];
    if ((0, node_fs_1.existsSync)(configPath)) {
        const config = JSON.parse((0, node_fs_1.readFileSync)(configPath, "utf8"));
        const ids = order === "start" ? config.startOrder ?? [] : config.stopOrder ?? [];
        for (const id of ids) {
            const adapter = byId.get(id);
            if (adapter)
                ordered.push(adapter);
        }
    }
    for (const adapter of adapters) {
        if (!ordered.some((item) => item.id === adapter.id))
            ordered.push(adapter);
    }
    return ordered;
}
