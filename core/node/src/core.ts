import { existsSync, readFileSync, rmSync } from "node:fs";
import type { ServiceStatus } from "./types";
import { loadAdapters, serviceOrder } from "./adapters";
import { setupDiagnostics, writeSetupSnapshot } from "./diagnostics";
import { resolveServiceEnvironment } from "./environment";
import { startAdapter, stopAdapter } from "./lifecycle";
import { getRoot, resolveRelative } from "./portable";
import { generatePortal, getPortalStatus, startPortalServer, stopPortalServer } from "./portal";
import { adapterHealth, processExists, writeStatusSnapshot } from "./status";
import { assertWslReadyForAdapterDistro, wslAdapterCommandPlan } from "./wsl-adapter";
import { wslExecutableInvocation } from "./wsl";

export { dataWritable, getRoot, portableEnv } from "./portable";
export { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";
export { adapterSetupPlan, appSourcePlan, checkoutAppSource, probeAppSources } from "./adapter-guidance";
export { markAdapterReady } from "./adapter-metadata";
export { runAdapterSetup } from "./adapter-setup";
export { verifyAdapter } from "./adapter-verification";
export { createBackup } from "./backup";
export { envFileDiagnostics, initializeEnvFiles, resolveServiceEnvironment, serviceEnvironmentDiagnostic } from "./environment";
export { pathDiagnostics, portDiagnostics, readLogTail, setupDiagnostics, writeSetupSnapshot } from "./diagnostics";
export { PORTAL_URL, generatePortal, getPortalStatus, startPortalServer, stopPortalServer } from "./portal";
export { installRuntimeFromArchive, loadRuntimeManifest, runtimeDiagnostics, runtimePreparationPlan } from "./runtimes";
export { writeStatusSnapshot } from "./status";
export { prepareWsl, wslDiagnostics } from "./wsl";
export { wslExport, wslImport, wslImportPlan, wslRootfsGuide, wslUnregisterPlan } from "./wsl-import";
export { wslWorkflowPlan } from "./wsl-workflow";

export async function startSkeleton(usbRoot: string) {
  const root = getRoot(usbRoot);
  const setup = setupDiagnostics(root);
  writeSetupSnapshot(root, setup);
  const started: string[] = [];
  for (const adapter of serviceOrder(root, "start").filter((item) => item.enabled)) {
    const wslPlan = adapter.runtime?.kind === "wsl2" ? wslAdapterCommandPlan(root, adapter, resolveServiceEnvironment(root, adapter.id), "start") : null;
    if (wslPlan && adapter.integration?.productionReady === true) {
      assertWslReadyForAdapterDistro(root, adapter.id, adapter.runtime?.distro);
    }
    startAdapter(root, adapter, wslPlan ? { processPlan: wslManagedProcessPlan(root, wslPlan) } : {});
    started.push(adapter.id);
  }
  generatePortal(root, getStatus(root).services);
  const portal = await startPortalServer(root);
  writeStatusSnapshot(root, getStatus(root));
  return { root, started, portal, setupMessages: setup.messages };
}

export function startSingleAdapter(usbRoot: string, serviceId: string | undefined, options: { dryRun: boolean; confirm: boolean }) {
  const root = getRoot(usbRoot);
  if (!serviceId) throw new Error("Service id is required. Example: start-adapter hermes-web-ui --confirm-start");
  const adapter = loadAdapters(root).find((item) => item.id === serviceId);
  if (!adapter) throw new Error(`Unknown adapter: ${serviceId}`);
  if (!adapter.commands.start) throw new Error(`Adapter ${serviceId} does not declare a start command.`);
  const wslPlan = adapter.runtime?.kind === "wsl2" ? wslAdapterCommandPlan(root, adapter, resolveServiceEnvironment(root, serviceId), "start") : null;
  const result = {
    root,
    serviceId,
    displayName: adapter.displayName,
    runner: wslPlan ? "wsl2" : "windows",
    dryRun: options.dryRun,
    confirmed: options.confirm,
    wouldModify: !options.dryRun,
    started: false,
    command: adapter.commands.start,
    appDir: resolveRelative(root, adapter.appDir),
    wsl: wslPlan
      ? {
        executablePath: wslPlan.executablePath,
        args: wslPlan.args,
        workingDirectory: wslPlan.workingDirectory,
        script: wslPlan.script,
      }
      : null,
    metadata: null as ReturnType<typeof startAdapter> | null,
    message: options.dryRun ? `Would start ${serviceId}.` : `Started ${serviceId}.`,
  };
  if (!options.dryRun && !options.confirm) {
    throw new Error("start-adapter launches a managed process. Re-run with --confirm-start to proceed.");
  }
  if (options.dryRun) return result;
  if (wslPlan) {
    assertWslReadyForAdapterDistro(root, serviceId, adapter.runtime?.distro);
    const metadata = startAdapter(root, adapter, {
      forceManaged: true,
      processPlan: wslManagedProcessPlan(root, wslPlan),
    });
    return { ...result, started: true, metadata };
  }
  const metadata = startAdapter(root, adapter, { forceManaged: true });
  return { ...result, started: true, metadata };
}

function wslManagedProcessPlan(root: string, wslPlan: ReturnType<typeof wslAdapterCommandPlan>) {
  const invocation = wslExecutableInvocation(wslPlan.executablePath, wslPlan.args);
  return {
    runner: "wsl2",
    executablePath: invocation.executablePath,
    args: invocation.args,
    command: [wslPlan.executablePath, ...wslPlan.args].join(" "),
    workingDirectory: root,
    metadata: {
      wsl: {
        executablePath: wslPlan.executablePath,
        args: wslPlan.args,
        workingDirectory: wslPlan.workingDirectory,
        script: wslPlan.script,
      },
    },
  };
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
    if (stopAdapter(root, adapter)) stopped.push(adapter.id);
  }
  return { root, stopped };
}
