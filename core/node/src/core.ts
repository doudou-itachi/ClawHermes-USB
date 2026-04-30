import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AdapterDescriptor, ServiceEnvironment, ServiceStatus } from "./types";
import { serviceOrder } from "./adapters";
import { resolveServiceEnvironment } from "./environment";
import { setupDiagnostics } from "./diagnostics";
import { getRoot, resolveRelative, writeLog } from "./portable";
import { generatePortal, getPortalStatus, killProcessTree, startPortalServer, stopPortalServer } from "./portal";
import { adapterHealth, processExists, writeStatusSnapshot } from "./status";

export { dataWritable, getRoot, portableEnv } from "./portable";
export { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";
export { envFileDiagnostics, initializeEnvFiles, resolveServiceEnvironment, serviceEnvironmentDiagnostic } from "./environment";
export { pathDiagnostics, portDiagnostics, readLogTail, setupDiagnostics } from "./diagnostics";
export { PORTAL_URL, generatePortal, getPortalStatus, startPortalServer, stopPortalServer } from "./portal";
export { installRuntimeFromArchive, loadRuntimeManifest, runtimeDiagnostics, runtimePreparationPlan } from "./runtimes";
export { writeStatusSnapshot } from "./status";

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
