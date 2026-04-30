import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PathDiagnostic, PortDiagnostic } from "./types";
import { integrationReadiness, loadAdapters, validateAdapter } from "./adapters";
import { envFileDiagnostics } from "./environment";
import { dataWritable, getRoot, resolveRelative } from "./portable";
import { runtimeDiagnostics } from "./runtimes";

export function setupDiagnostics(usbRoot: string) {
  const root = getRoot(usbRoot);
  const adapters = loadAdapters(root);
  const knownIds = adapters.map((adapter) => adapter.id);
  const adapterResults = adapters.map((adapter) => validateAdapter(adapter, knownIds));
  const runtimes = runtimeDiagnostics(root);
  const readiness = integrationReadiness(adapters);
  const ports = portDiagnostics(root);
  const paths = pathDiagnostics(root);
  const envFiles = envFileDiagnostics(root, adapters);
  const writable = dataWritable(root);
  const messages: string[] = [];

  for (const runtime of runtimes) {
    if (!runtime.found) messages.push(`${runtime.label} not found at ${runtime.path}.`);
  }
  for (const adapter of adapterResults) {
    for (const error of adapter.errors) messages.push(`Adapter ${adapter.id}: ${error}`);
  }
  for (const item of readiness) {
    if (!item.productionReady) messages.push(`Adapter ${item.id} integration is not production-ready: ${item.summary}`);
  }
  for (const port of ports) {
    if (!port.available) messages.push(`Port ${port.port} is already in use for ${port.name}. Stop the conflicting process or change config/defaults/ports.json.`);
  }
  for (const path of paths) {
    if (path.required && !path.exists) messages.push(`Required ${path.type} is missing: ${path.path}.`);
  }
  for (const envFile of envFiles) {
    if (!envFile.exists) {
      messages.push(`Env file missing: ${envFile.path}. To configure ${envFile.serviceId}, copy ${envFile.examplePath} to ${envFile.path}.`);
    }
  }
  if (!writable) messages.push("Data directory is not writable.");

  return { root, adapters: adapterResults, runtimes, readiness, ports, paths, envFiles, dataWritable: writable, messages };
}

export function readLogTail(usbRoot: string, target: string, requestedLines: number) {
  const root = getRoot(usbRoot);
  const lineCount = Math.max(1, Math.min(Number.isFinite(requestedLines) ? Math.floor(requestedLines) : 50, 200));
  const logPath = resolveLogTarget(root, target);
  const exists = existsSync(logPath);
  const lines = exists
    ? readFileSync(logPath, "utf8").split(/\r?\n/).filter((line) => line.length > 0).slice(-lineCount)
    : [];
  return {
    root,
    target,
    path: logPath,
    exists,
    requestedLines: lineCount,
    lines,
  };
}

function resolveLogTarget(usbRoot: string, target: string): string {
  const root = getRoot(usbRoot);
  if (target === "launcher") return join(root, "data", "logs", "launcher.log");
  const adapter = loadAdapters(root).find((item) => item.id === target);
  if (!adapter) throw new Error(`Unknown log target: ${target}`);
  return resolveRelative(root, adapter.logFile);
}

export function pathDiagnostics(usbRoot: string): PathDiagnostic[] {
  const root = getRoot(usbRoot);
  const required: Array<{ path: string; type: "directory" | "file" }> = [
    { path: "adapters", type: "directory" },
    { path: "apps/openclaw", type: "directory" },
    { path: "apps/hermes-agent", type: "directory" },
    { path: "apps/hermes-web-ui", type: "directory" },
    { path: "config/defaults/ports.json", type: "file" },
    { path: "config/defaults/services.json", type: "file" },
    { path: "config/defaults/runtimes.json", type: "file" },
    { path: "data/logs", type: "directory" },
    { path: "data/tmp", type: "directory" },
    { path: "portal", type: "directory" },
  ];
  return required.map((item) => {
    const absolute = resolveRelative(root, item.path);
    const exists = existsSync(absolute);
    return {
      path: item.path,
      type: item.type,
      required: true,
      exists: exists && (item.type === "file" ? !isDirectory(absolute) : isDirectory(absolute)),
    };
  });
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function portDiagnostics(usbRoot: string): PortDiagnostic[] {
  const root = getRoot(usbRoot);
  const configPath = join(root, "config", "defaults", "ports.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  const diagnostics: PortDiagnostic[] = [];
  for (const [name, value] of Object.entries(config)) {
    if (typeof value === "number") {
      diagnostics.push({
        name,
        host: "127.0.0.1",
        port: value,
        available: isTcpPortAvailableSync(value),
      });
    }
  }
  return diagnostics;
}

function isTcpPortAvailableSync(port: number): boolean {
  try {
    const output = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      `$client = [System.Net.Sockets.TcpClient]::new(); $async = $client.BeginConnect('127.0.0.1', ${port}, $null, $null); if ($async.AsyncWaitHandle.WaitOne(200)) { try { $client.EndConnect($async); 'true' } catch { 'false' } } else { 'false' }; $client.Close()`,
    ], { encoding: "utf8", timeout: 3000 }).trim();
    return output.toLowerCase() !== "true";
  } catch {
    return true;
  }
}
