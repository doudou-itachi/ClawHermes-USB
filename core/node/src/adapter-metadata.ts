import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdapterDescriptor } from "./types";
import { getRoot } from "./portable";
import { verifyAdapter } from "./adapter-verification";

export function markAdapterReady(usbRoot: string, serviceId: string | undefined, options: { confirm: boolean; summary?: string }) {
  const root = getRoot(usbRoot);
  if (!serviceId) throw new Error("Service id is required. Example: mark-adapter-ready hermes-web-ui --confirm-ready --summary \"Verified locally\"");
  if (!options.confirm) throw new Error("mark-adapter-ready modifies adapter metadata. Re-run with --confirm-ready to proceed.");
  const summary = options.summary?.trim();
  if (!summary) throw new Error("--summary is required and must describe the verification evidence.");

  const verification = verifyAdapter(root, serviceId);
  if (!verification.productionReadyCandidate) {
    throw new Error(`Adapter ${serviceId} is not a production-ready candidate: ${verification.nextSteps.join("; ")}`);
  }

  const adapterPath = join(root, "adapters", serviceId, "adapter.json");
  if (!existsSync(adapterPath)) throw new Error(`Adapter descriptor not found: adapters/${serviceId}/adapter.json`);
  const adapter = JSON.parse(readFileSync(adapterPath, "utf8")) as AdapterDescriptor;
  adapter.integration = {
    ...(adapter.integration ?? {}),
    status: "verified",
    productionReady: true,
    verifiedAt: new Date().toISOString().slice(0, 10),
    summary,
  };
  writeFileSync(adapterPath, `${JSON.stringify(adapter, null, 2)}\n`, "utf8");
  return {
    root,
    serviceId,
    adapterPath,
    updated: true,
    integration: adapter.integration,
    verification,
  };
}
