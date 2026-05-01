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
    const script = [
        "$ProgressPreference = 'SilentlyContinue'",
        `$timeoutMs = ${timeoutMs}`,
        `$request = [System.Net.WebRequest]::Create('${escapePowerShellSingleQuoted(url)}')`,
        "$request.Method = 'GET'",
        "$request.Timeout = $timeoutMs",
        "try {",
        "  $response = $request.GetResponse()",
        "  [pscustomobject]@{ ok = ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400); statusCode = [int]$response.StatusCode; error = $null } | ConvertTo-Json -Compress",
        "} catch {",
        "  $statusCode = $null",
        "  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) { $statusCode = [int]$_.Exception.Response.StatusCode }",
        "  [pscustomobject]@{ ok = $false; statusCode = $statusCode; error = $_.Exception.Message } | ConvertTo-Json -Compress",
        "} finally {",
        "  if ($response) { $response.Close() }",
        "}",
    ].join("; ");
    try {
        const output = (0, node_child_process_1.execFileSync)("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: timeoutMs + 1000 }).trim();
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
function escapePowerShellSingleQuoted(value) {
    return value.replaceAll("'", "''");
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
