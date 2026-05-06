"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeStatusSnapshot = writeStatusSnapshot;
exports.adapterHealth = adapterHealth;
exports.processExists = processExists;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
function writeStatusSnapshot(usbRoot, status) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const snapshotPath = (0, node_path_1.join)(root, "data", "tmp", "status.json");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(snapshotPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(snapshotPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    return snapshotPath;
}
function adapterHealth(adapter, status, placeholder) {
    const type = typeof adapter.health?.type === "string" ? adapter.health.type : "unknown";
    const url = typeof adapter.health?.url === "string" ? adapter.health.url : null;
    if (status === "stopped") {
        return { type, ready: false, reason: "Service is stopped.", ...(url ? { url, statusCode: null } : {}) };
    }
    if (placeholder === true) {
        return { type, ready: false, reason: "Placeholder metadata is present, but no real process was launched.", ...(url ? { url, statusCode: null } : {}) };
    }
    if (type === "http")
        return httpAdapterHealth(adapter);
    if (type === "process" && status === "running") {
        return { type, ready: true, reason: "Managed process is running." };
    }
    return {
        type,
        ready: status === "running",
        reason: status === "running" ? "Service reports running." : `Service status is ${status}.`,
    };
}
function httpAdapterHealth(adapter) {
    const url = typeof adapter.health?.url === "string" ? adapter.health.url : null;
    if (!url) {
        return { type: "http", ready: false, reason: "HTTP health URL is not configured.", url: null, statusCode: null };
    }
    const timeoutSeconds = typeof adapter.health?.timeoutSeconds === "number" ? adapter.health.timeoutSeconds : 2;
    const probe = probeHttpHealth(url, timeoutSeconds);
    return {
        type: "http",
        ready: probe.ready,
        reason: probe.reason,
        url,
        statusCode: probe.statusCode,
    };
}
function probeHttpHealth(url, timeoutSeconds) {
    const timeoutMs = Math.max(1, Math.min(timeoutSeconds, 60)) * 1000;
    try {
        const output = execNodeHealthProbe(url, timeoutMs).trim();
        const parsed = JSON.parse(output);
        if (parsed.ok === true) {
            return { ready: true, statusCode: parsed.statusCode ?? null, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
        }
        if (typeof parsed.statusCode === "number") {
            return { ready: false, statusCode: parsed.statusCode, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
        }
        return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${parsed.error ?? "request failed"}.` };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${message}.` };
    }
}
function execNodeHealthProbe(url, timeoutMs) {
    const script = [
        "const url = process.argv[1];",
        "const timeoutMs = Number(process.argv[2]);",
        "const client = url.startsWith('https:') ? require('node:https') : require('node:http');",
        "const finish = (payload) => { console.log(JSON.stringify(payload)); };",
        "const request = client.request(url, { method: 'GET', timeout: timeoutMs }, (response) => {",
        "  response.resume();",
        "  response.on('end', () => finish({ ok: response.statusCode >= 200 && response.statusCode < 400, statusCode: response.statusCode ?? null, error: null }));",
        "});",
        "request.on('timeout', () => request.destroy(new Error('request timed out')));",
        "request.on('error', (error) => finish({ ok: false, statusCode: null, error: error.message }));",
        "request.end();",
    ].join("");
    return (0, node_child_process_1.execFileSync)(process.execPath, ["-e", script, url, String(timeoutMs)], {
        encoding: "utf8",
        timeout: timeoutMs + 1000,
        windowsHide: true,
    });
}
function processExists(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        const code = error.code;
        return code === "EPERM";
    }
}
