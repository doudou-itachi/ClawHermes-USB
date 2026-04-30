import { existsSync, readFileSync, rmSync } from "node:fs";
import type { ServiceStatus } from "./types";
import { serviceOrder } from "./adapters";
import { setupDiagnostics, writeSetupSnapshot } from "./diagnostics";
import { startAdapter, stopAdapter } from "./lifecycle";
import { getRoot, resolveRelative } from "./portable";
import { generatePortal, getPortalStatus, startPortalServer, stopPortalServer } from "./portal";
import { adapterHealth, processExists, writeStatusSnapshot } from "./status";

export { dataWritable, getRoot, portableEnv } from "./portable";
export { integrationReadiness, loadAdapters, serviceOrder, validateAdapter } from "./adapters";
export { adapterSetupPlan, appSourcePlan, checkoutAppSource } from "./adapter-guidance";
export { markAdapterReady } from "./adapter-metadata";
export { runAdapterSetup } from "./adapter-setup";
export { verifyAdapter } from "./adapter-verification";
export { createBackup } from "./backup";
export { envFileDiagnostics, initializeEnvFiles, resolveServiceEnvironment, serviceEnvironmentDiagnostic } from "./environment";
export { pathDiagnostics, portDiagnostics, readLogTail, setupDiagnostics, writeSetupSnapshot } from "./diagnostics";
export { PORTAL_URL, generatePortal, getPortalStatus, startPortalServer, stopPortalServer } from "./portal";
export { installRuntimeFromArchive, loadRuntimeManifest, runtimeDiagnostics, runtimePreparationPlan } from "./runtimes";
export { writeStatusSnapshot } from "./status";

export async function startSkeleton(usbRoot: string) {
  const root = getRoot(usbRoot);
  const setup = setupDiagnostics(root);
  writeSetupSnapshot(root, setup);
  const started: string[] = [];
  for (const adapter of serviceOrder(root, "start").filter((item) => item.enabled)) {
    startAdapter(root, adapter);
    started.push(adapter.id);
  }
  generatePortal(root, getStatus(root).services);
  const portal = await startPortalServer(root);
  writeStatusSnapshot(root, getStatus(root));
  return { root, started, portal, setupMessages: setup.messages };
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
