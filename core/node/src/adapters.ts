import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { AdapterDescriptor, AdapterValidation, IntegrationReadiness } from "./types";
import { getRoot } from "./portable";

export function loadAdapters(usbRoot: string): AdapterDescriptor[] {
  const adapterRoot = join(getRoot(usbRoot), "adapters");
  return readdirSync(adapterRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(adapterRoot, entry.name, "adapter.json"))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")) as AdapterDescriptor)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function isRelativePath(value: string | null | undefined): boolean {
  return !value || !isAbsolute(value);
}

export function validateAdapter(adapter: AdapterDescriptor, knownIds: string[]): AdapterValidation {
  const errors: string[] = [];
  if (!adapter.id) errors.push("id is required");
  if (!isRelativePath(adapter.appDir)) errors.push("appDir must be relative");
  if (!isRelativePath(adapter.dataDir)) errors.push("dataDir must be relative");
  if (!isRelativePath(adapter.logFile)) errors.push("logFile must be relative");
  if (adapter.logFile && !adapter.logFile.replaceAll("\\", "/").startsWith("data/logs/")) {
    errors.push("logFile must be under data/logs");
  }
  if (!isRelativePath(adapter.pidFile)) errors.push("pidFile must be relative");
  if (adapter.pidFile && !adapter.pidFile.replaceAll("\\", "/").startsWith("data/tmp/")) {
    errors.push("pidFile must be under data/tmp");
  }
  if (!adapter.health) errors.push("health is required");
  for (const dependency of adapter.dependsOn ?? []) {
    if (!knownIds.includes(dependency)) errors.push(`dependsOn references unknown service: ${dependency}`);
  }
  return { id: adapter.id, valid: errors.length === 0, errors };
}

export function integrationReadiness(adapters: AdapterDescriptor[]): IntegrationReadiness[] {
  return adapters.map((adapter) => ({
    id: adapter.id,
    status: adapter.integration?.status ?? "unknown",
    productionReady: adapter.integration?.productionReady === true,
    verifiedAt: adapter.integration?.verifiedAt ?? null,
    summary: adapter.integration?.summary ?? "No upstream integration metadata has been recorded for this adapter.",
    sources: adapter.integration?.sources ?? [],
  }));
}

export function serviceOrder(usbRoot: string, order: "start" | "stop"): AdapterDescriptor[] {
  const root = getRoot(usbRoot);
  const adapters = loadAdapters(root);
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  const configPath = join(root, "config", "defaults", "services.json");
  const ordered: AdapterDescriptor[] = [];
  if (existsSync(configPath)) {
    const config = JSON.parse(readFileSync(configPath, "utf8")) as { startOrder?: string[]; stopOrder?: string[] };
    const ids = order === "start" ? config.startOrder ?? [] : config.stopOrder ?? [];
    for (const id of ids) {
      const adapter = byId.get(id);
      if (adapter) ordered.push(adapter);
    }
  }
  for (const adapter of adapters) {
    if (!ordered.some((item) => item.id === adapter.id)) ordered.push(adapter);
  }
  return ordered;
}
