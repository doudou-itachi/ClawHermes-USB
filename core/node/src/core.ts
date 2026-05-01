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
import { applyRuntimePortsToAdapter, applyRuntimePortsToEnvironment, assignRuntimePorts, readRuntimePortState } from "./ports-runtime";

export { dataWritable, getRoot, portableEnv } from "./portable";
export { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";
export { adapterSetupPlan, appSourcePlan, checkoutAppSource, probeAppSources } from "./adapter-guidance";
export { markAdapterReady } from "./adapter-metadata";
export { runAdapterSetup } from "./adapter-setup";
export { verifyAdapter } from "./adapter-verification";
export { createBackup, restoreBackup, restorePlan } from "./backup";
export { envFileDiagnostics, initializeEnvFiles, resolveServiceEnvironment, serviceEnvironmentDiagnostic } from "./environment";
export { pathDiagnostics, portDiagnostics, readLogTail, setupDiagnostics, writeSetupSnapshot } from "./diagnostics";
export { PORTAL_URL, generatePortal, getPortalStatus, startPortalServer, stopPortalServer } from "./portal";
export { installRuntimeFromArchive, loadRuntimeManifest, runtimeDiagnostics, runtimePreparationPlan } from "./runtimes";
export { configureSharedModel, sharedModelConfigStatus } from "./model-config";
export { payloadExport } from "./payload-export";
export { payloadInventory } from "./payloads";
export { assignRuntimePorts, readRuntimePortState } from "./ports-runtime";
export { setupWizard } from "./setup-wizard";
export { writeStatusSnapshot } from "./status";
export { prepareWsl, wslDiagnostics } from "./wsl";
export { wslExport, wslImport, wslImportPlan, wslRootfsGuide, wslUnregister, wslUnregisterPlan } from "./wsl-import";
export { wslWorkflowPlan } from "./wsl-workflow";

export async function startSkeleton(usbRoot: string) {
  const root = getRoot(usbRoot);
  const setup = setupDiagnostics(root);
  writeSetupSnapshot(root, setup);
  const started: string[] = [];
  const adapters = serviceOrder(root, "start").filter((item) => item.enabled);
  const portState = await assignRuntimePorts(root, adapters);
  for (const sourceAdapter of adapters) {
    const adapter = applyRuntimePortsToAdapter(sourceAdapter, portState);
    const serviceEnv = applyRuntimePortsToEnvironment(resolveServiceEnvironment(root, adapter.id), portState);
    const shouldPrepareWslPlan = adapter.runtime?.kind === "wsl2" && adapter.integration?.productionReady === true && Boolean(adapter.commands.start);
    const wslPlan = shouldPrepareWslPlan ? wslAdapterCommandPlan(root, adapter, serviceEnv, "start") : null;
    if (wslPlan && adapter.integration?.productionReady === true) {
      assertWslReadyForAdapterDistro(root, adapter.id, adapter.runtime?.distro);
    }
    startAdapter(root, adapter, wslPlan ? { processPlan: wslManagedProcessPlan(root, adapter, wslPlan), serviceEnv } : { serviceEnv });
    started.push(adapter.id);
  }
  generatePortal(root, getStatus(root).services);
  const portal = await startPortalServer(root, portState.portal.assignedPort);
  writeStatusSnapshot(root, getStatus(root));
  return { root, started, portal, setupMessages: setup.messages };
}

export function startSingleAdapter(usbRoot: string, serviceId: string | undefined, options: { dryRun: boolean; confirm: boolean }) {
  const root = getRoot(usbRoot);
  if (!serviceId) throw new Error("Service id is required. Example: start-adapter hermes-web-ui --confirm-start");
  const adapter = loadAdapters(root).find((item) => item.id === serviceId);
  if (!adapter) throw new Error(`Unknown adapter: ${serviceId}`);
  if (!adapter.commands.start) throw new Error(`Adapter ${serviceId} does not declare a start command.`);
  const portState = readRuntimePortState(root);
  const runtimeAdapter = applyRuntimePortsToAdapter(adapter, portState);
  const serviceEnv = applyRuntimePortsToEnvironment(resolveServiceEnvironment(root, serviceId), portState);
  const wslPlan = runtimeAdapter.runtime?.kind === "wsl2" ? wslAdapterCommandPlan(root, runtimeAdapter, serviceEnv, "start") : null;
  const result = {
    root,
    serviceId,
    displayName: runtimeAdapter.displayName,
    runner: wslPlan ? "wsl2" : "windows",
    dryRun: options.dryRun,
    confirmed: options.confirm,
    wouldModify: !options.dryRun,
    started: false,
    command: runtimeAdapter.commands.start,
    appDir: resolveRelative(root, runtimeAdapter.appDir),
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
    assertWslReadyForAdapterDistro(root, serviceId, runtimeAdapter.runtime?.distro);
    const metadata = startAdapter(root, runtimeAdapter, {
      forceManaged: true,
      processPlan: wslManagedProcessPlan(root, runtimeAdapter, wslPlan),
      serviceEnv,
    });
    return { ...result, started: true, metadata };
  }
  const metadata = startAdapter(root, runtimeAdapter, { forceManaged: true, serviceEnv });
  return { ...result, started: true, metadata };
}

function wslManagedProcessPlan(root: string, adapter: ReturnType<typeof loadAdapters>[number], wslPlan: ReturnType<typeof wslAdapterCommandPlan>) {
  const logPath = resolveRelative(root, adapter.logFile);
  const wslLogPath = logPath.match(/^[A-Za-z]:[\\/]/) ? logPath.replace(/^([A-Za-z]):[\\/]*(.*)$/, (_, drive: string, rest: string) => `/mnt/${drive.toLowerCase()}/${String(rest).replaceAll("\\", "/")}`) : logPath;
  const backgroundScript = `mkdir -p "$(dirname '${wslLogPath.replaceAll("'", "'\"'\"'")}')" && nohup bash -lc '${wslPlan.script.replaceAll("'", "'\"'\"'")}' >> '${wslLogPath.replaceAll("'", "'\"'\"'")}' 2>&1 < /dev/null & echo $!`;
  const backgroundArgs = [...wslPlan.args.slice(0, -1), backgroundScript];
  const invocation = wslExecutableInvocation(wslPlan.executablePath, backgroundArgs);
  return {
    runner: "wsl2-background",
    executablePath: invocation.executablePath,
    args: invocation.args,
    command: [wslPlan.executablePath, ...backgroundArgs].join(" "),
    workingDirectory: root,
    metadata: {
      wsl: {
        executablePath: wslPlan.executablePath,
        args: backgroundArgs,
        workingDirectory: wslPlan.workingDirectory,
        script: wslPlan.script,
        background: true,
      },
    },
  };
}

export function getStatus(usbRoot: string) {
  const root = getRoot(usbRoot);
  const portState = readRuntimePortState(root);
  const services: ServiceStatus[] = serviceOrder(root, "start").map((sourceAdapter) => {
    const adapter = applyRuntimePortsToAdapter(sourceAdapter, portState);
    const pidFile = resolveRelative(root, adapter.pidFile);
    let status = "stopped";
    let processId: number | null = null;
    let placeholder: boolean | null = null;
    let healthOverride: ReturnType<typeof adapterHealth> | null = null;
    if (existsSync(pidFile)) {
      const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { status?: string; placeholder?: boolean; processId?: number; runner?: string };
      if (metadata.placeholder === false && metadata.runner === "wsl2-background") {
        status = metadata.status ?? "running";
        processId = null;
        placeholder = false;
      } else if (metadata.placeholder === false && metadata.processId && !processExists(metadata.processId)) {
        const candidateStatus = metadata.status ?? "running";
        const candidateHealth = adapter.runtime?.kind === "wsl2" && adapter.health?.type === "http"
          ? adapterHealth(adapter, candidateStatus, false)
          : null;
        if (candidateHealth?.ready) {
          status = candidateStatus;
          processId = null;
          placeholder = false;
          healthOverride = candidateHealth;
        } else {
          rmSync(pidFile, { force: true });
          status = "stopped";
        }
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
      health: healthOverride ?? adapterHealth(adapter, status, placeholder),
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
