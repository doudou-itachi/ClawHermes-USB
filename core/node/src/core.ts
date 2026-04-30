import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AdapterDescriptor, PathDiagnostic, PortDiagnostic, ServiceEnvironment, ServiceStatus } from "./types";
import { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";
import { envFileDiagnostics, initializeEnvFiles, resolveServiceEnvironment, serviceEnvironmentDiagnostic } from "./environment";
import { dataWritable, getRoot, portableEnv, resolveRelative, writeLog } from "./portable";
import { generatePortal, getPortalStatus, killProcessTree, startPortalServer, stopPortalServer } from "./portal";
import { installRuntimeFromArchive, loadRuntimeManifest, runtimeDiagnostics, runtimePreparationPlan } from "./runtimes";
import { adapterHealth, processExists, writeStatusSnapshot } from "./status";

export { dataWritable, getRoot, portableEnv } from "./portable";
export { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";
export { envFileDiagnostics, initializeEnvFiles, resolveServiceEnvironment, serviceEnvironmentDiagnostic } from "./environment";
export { PORTAL_URL, generatePortal, getPortalStatus, startPortalServer, stopPortalServer } from "./portal";
export { installRuntimeFromArchive, loadRuntimeManifest, runtimeDiagnostics, runtimePreparationPlan } from "./runtimes";
export { writeStatusSnapshot } from "./status";

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

export async function startSkeleton(usbRoot: string) {
  const root = getRoot(usbRoot);
  const setup = setupDiagnostics(root);
  const started: string[] = [];
  for (const adapter of serviceOrder(root, "start").filter((item) => item.enabled)) {
    const pidFile = resolveRelative(root, adapter.pidFile);
    const logFile = resolveRelative(root, adapter.logFile);
    const serviceEnv = resolveServiceEnvironment(root, adapter.id);
    mkdirSync(dirname(pidFile), { recursive: true });
    mkdirSync(dirname(logFile), { recursive: true });
    const metadata = shouldLaunchManagedProcess(adapter)
      ? launchManagedAdapterProcess(root, adapter, serviceEnv)
      : {
        serviceId: adapter.id,
        displayName: adapter.displayName,
        status: "placeholder-started",
        startedAt: new Date().toISOString(),
        command: adapter.commands.start ?? null,
        workingDirectory: resolveRelative(root, adapter.appDir),
        logFile,
        environment: environmentMetadata(serviceEnv),
        placeholder: true,
      };
    writeFileSync(pidFile, JSON.stringify(metadata, null, 2), "utf8");
    if (metadata.placeholder) {
      appendFileSync(logFile, `${new Date().toISOString()} [${adapter.id}] [INFO] Placeholder service started.\n`);
      writeLog(root, adapter.id, "INFO", "Started placeholder service.");
    } else if ("processId" in metadata) {
      writeLog(root, adapter.id, "INFO", `Started managed service process ${metadata.processId}.`);
    }
    started.push(adapter.id);
  }
  generatePortal(root, getStatus(root).services);
  const portal = await startPortalServer(root);
  writeStatusSnapshot(root, getStatus(root));
  return { root, started, portal, setupMessages: setup.messages };
}

function shouldLaunchManagedProcess(adapter: AdapterDescriptor): boolean {
  return adapter.integration?.productionReady === true && Boolean(adapter.commands.start);
}

function environmentMetadata(serviceEnv: ServiceEnvironment) {
  return {
    files: serviceEnv.files,
    variables: Object.keys(serviceEnv.env).sort(),
  };
}

function launchManagedAdapterProcess(root: string, adapter: AdapterDescriptor, serviceEnv: ServiceEnvironment) {
  const command = adapter.commands.start;
  if (!command) throw new Error(`Adapter ${adapter.id} has no start command.`);
  const workingDirectory = resolveRelative(root, adapter.appDir);
  const logFile = resolveRelative(root, adapter.logFile);
  const logFd = openSync(logFile, "a");
  try {
    const child = spawn(command, {
      cwd: workingDirectory,
      env: { ...process.env, ...serviceEnv.env },
      detached: true,
      shell: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    });
    child.unref();
    return {
      serviceId: adapter.id,
      displayName: adapter.displayName,
      status: "running",
      processId: child.pid ?? 0,
      startedAt: new Date().toISOString(),
      command,
      workingDirectory,
      logFile,
      environment: environmentMetadata(serviceEnv),
      placeholder: false,
    };
  } finally {
    closeSync(logFd);
  }
}

export function getStatus(usbRoot: string) {
  const root = getRoot(usbRoot);
  const services: ServiceStatus[] = serviceOrder(root, "start").map((adapter) => {
    const pidFile = resolveRelative(root, adapter.pidFile);
    let status = "stopped";
    let processId: number | null = null;
    let placeholder: boolean | null = null;
    if (existsSync(pidFile)) {
      const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { status?: string; placeholder?: boolean; processId?: number };
      if (metadata.placeholder === false && metadata.processId && !processExists(metadata.processId)) {
        rmSync(pidFile, { force: true });
        status = "stopped";
      } else {
        status = metadata.status ?? "unknown";
        processId = metadata.placeholder === false ? metadata.processId ?? null : null;
        placeholder = metadata.placeholder ?? null;
      }
    }
    return {
      id: adapter.id,
      displayName: adapter.displayName,
      status,
      pidFile,
      logFile: resolveRelative(root, adapter.logFile),
      portalUrl: adapter.portal?.url ?? null,
      processId,
      placeholder,
      health: adapterHealth(adapter, status, placeholder),
    };
  });
  services.push(getPortalStatus(root));
  return { root, generatedAt: new Date().toISOString(), services };
}

export function stopSkeleton(usbRoot: string) {
  const root = getRoot(usbRoot);
  const stopped: string[] = [];
  if (stopPortalServer(root)) stopped.push("portal");
  for (const adapter of serviceOrder(root, "stop")) {
    const pidFile = resolveRelative(root, adapter.pidFile);
    if (existsSync(pidFile)) {
      const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { placeholder?: boolean; processId?: number };
      if (metadata.placeholder === false && metadata.processId) {
        try {
          killProcessTree(metadata.processId);
        } catch {
          // Already gone.
        }
      }
      rmSync(pidFile, { force: true });
      writeLog(root, adapter.id, "INFO", metadata.placeholder === false ? "Stopped managed service." : "Stopped placeholder service.");
      stopped.push(adapter.id);
    }
  }
  return { root, stopped };
}
