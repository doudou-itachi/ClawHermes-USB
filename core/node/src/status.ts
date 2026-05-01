import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdapterDescriptor } from "./types";
import { getRoot } from "./portable";

export function writeStatusSnapshot(usbRoot: string, status: unknown): string {
  const root = getRoot(usbRoot);
  const snapshotPath = join(root, "data", "tmp", "status.json");
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
  return snapshotPath;
}

export function adapterHealth(adapter: AdapterDescriptor, status: string, placeholder: boolean | null) {
  const type = typeof adapter.health?.type === "string" ? adapter.health.type : "unknown";
  const url = typeof adapter.health?.url === "string" ? adapter.health.url : null;
  if (status === "stopped") {
    return { type, ready: false, reason: "Service is stopped.", ...(url ? { url, statusCode: null } : {}) };
  }
  if (placeholder === true) {
    return { type, ready: false, reason: "Placeholder metadata is present, but no real process was launched.", ...(url ? { url, statusCode: null } : {}) };
  }
  if (type === "http") return httpAdapterHealth(adapter);
  if (type === "process" && status === "running") {
    return { type, ready: true, reason: "Managed process is running." };
  }
  return {
    type,
    ready: status === "running",
    reason: status === "running" ? "Service reports running." : `Service status is ${status}.`,
  };
}

function httpAdapterHealth(adapter: AdapterDescriptor) {
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

function probeHttpHealth(url: string, timeoutSeconds: number): { ready: boolean; statusCode: number | null; reason: string } {
  const timeoutMs = Math.max(1, Math.min(timeoutSeconds, 60)) * 1000;
  const script = [
    "$utf8NoBom = New-Object System.Text.UTF8Encoding $false",
    "[Console]::OutputEncoding = $utf8NoBom",
    "$OutputEncoding = $utf8NoBom",
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
    const output = execPowerShell(script, timeoutMs + 1000).trim();
    const parsed = JSON.parse(output) as { ok?: boolean; statusCode?: number | null; error?: string | null };
    if (parsed.ok === true) {
      return { ready: true, statusCode: parsed.statusCode ?? null, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
    }
    if (typeof parsed.statusCode === "number") {
      return { ready: false, statusCode: parsed.statusCode, reason: `HTTP health endpoint responded with ${parsed.statusCode}.` };
    }
    return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${parsed.error ?? "request failed"}.` };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ready: false, statusCode: null, reason: `HTTP health endpoint is unreachable: ${message}.` };
  }
}

function execPowerShell(script: string, timeout: number): string {
  const powershell = process.env.CLAWHERMES_POWERSHELL_EXE || "powershell";
  const args = ["-NoProfile", "-Command", script];
  const lower = powershell.toLowerCase();
  if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
    return execFileSync("cmd", ["/d", "/c", powershell, ...args], { encoding: "utf8", timeout });
  }
  return execFileSync(powershell, args, { encoding: "utf8", timeout });
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replaceAll("'", "''");
}

export function processExists(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    return code === "EPERM";
  }
}
