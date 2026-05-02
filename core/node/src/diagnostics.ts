import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PathDiagnostic, PortDiagnostic, SetupAction } from "./types";
import { integrationReadiness, loadAdapters, validateAdapter } from "./adapters";
import { envFileDiagnostics } from "./environment";
import { dataWritable, getRoot, resolveRelative } from "./portable";
import { adapterRuntimeRequirementDiagnostics, runtimeDiagnostics } from "./runtimes";
import { wslDiagnostics } from "./wsl";
import { wslImportPlan } from "./wsl-import";

export function setupDiagnostics(usbRoot: string) {
  const root = getRoot(usbRoot);
  const adapters = loadAdapters(root);
  const knownIds = adapters.map((adapter) => adapter.id);
  const adapterResults = adapters.map((adapter) => validateAdapter(adapter, knownIds));
  const runtimes = runtimeDiagnostics(root);
  const adapterRuntimeRequirements = adapterRuntimeRequirementDiagnostics(root, adapters);
  const readiness = integrationReadiness(adapters);
  const ports = portDiagnostics(root);
  const paths = pathDiagnostics(root);
  const envFiles = envFileDiagnostics(root, adapters);
  const wsl = wslDiagnostics(root);
  const wslAdapters = adapters.filter((adapter) => adapter.runtime?.kind === "wsl2" || adapter.integration?.platform === "wsl2");
  const wslArtifacts = wslArtifactDiagnostics(root, wslAdapters);
  const writable = dataWritable(root);
  const messages: string[] = [];
  const actions: SetupAction[] = [];

  for (const runtime of runtimes) {
    if (!runtime.found) {
      messages.push(`${runtime.label} not found at ${runtime.path}.`);
      actions.push({
        id: `runtime:${runtime.name}`,
        category: "runtime",
        severity: "warning",
        title: `Review runtime preparation plan for ${runtime.label}`,
        detail: `${runtime.label} is expected at ${runtime.path}. Download or place the ${runtime.packageType} package before running real services.`,
        command: "node core/node/dist/clawhermes.js runtimes --json",
        path: runtime.path,
        docs: runtime.sourceUrl,
      });
    }
  }
  for (const requirement of adapterRuntimeRequirements) {
    if (requirement.versionRequirement && requirement.found && requirement.satisfies === false) {
      messages.push(requirement.message);
      actions.push({
        id: `runtime-version:${requirement.serviceId}:${requirement.runtime}`,
        category: "runtime",
        severity: "warning",
        title: `Install ${requirement.runtime} ${requirement.versionRequirement} for ${requirement.serviceId}`,
        detail: requirement.message,
        command: "node core/node/dist/clawhermes.js runtimes --json",
        path: requirement.executablePath ?? undefined,
        serviceId: requirement.serviceId,
      });
    }
  }
  for (const adapter of adapterResults) {
    for (const error of adapter.errors) messages.push(`Adapter ${adapter.id}: ${error}`);
  }
  for (const item of readiness) {
    if (!item.productionReady) {
      messages.push(`Adapter ${item.id} integration is not production-ready: ${item.summary}`);
      actions.push({
        id: `adapter-integration:${item.id}`,
        category: "adapter-integration",
        severity: item.status === "blocked" ? "warning" : "info",
        title: `Review ${item.id} adapter integration`,
        detail: item.summary,
        docs: item.sources[0],
        serviceId: item.id,
      });
    }
  }
  for (const adapter of wslAdapters) {
    const adapterWsl = wslDiagnostics(root, adapter.runtime?.distro);
    const wslReady = adapter.runtime?.distro
      ? adapterWsl.hasDesiredDistro && adapterWsl.desiredDistroVersion === 2
      : adapterWsl.hasWsl2Distro;
    if (!adapterWsl.found || !wslReady) {
      const detail = adapterWsl.messages.join(" ");
      messages.push(`Adapter ${adapter.id} requires WSL2: ${detail}`);
      actions.push({
        id: `wsl2:${adapter.id}`,
        category: "wsl2",
        severity: "warning",
        title: `Install or enable WSL2 for ${adapter.id}`,
        detail,
        command: adapter.runtime?.sourceDistro
          ? `node core/node/dist/clawhermes.js wsl-workflow ${adapter.id} --json`
          : wslPreparationCommand(adapter.runtime?.distro),
        docs: adapter.integration?.sources?.[0] ?? adapter.upstream?.installDocs,
        serviceId: adapter.id,
      });
    }
  }
  for (const artifact of wslArtifacts) {
    if (!artifact.sourceArchiveExists) {
      messages.push(`WSL rootfs archive missing for ${artifact.serviceId}: ${artifact.archivePath}.`);
      actions.push({
        id: `wsl-artifact:${artifact.serviceId}`,
        category: "wsl-artifact",
        severity: "warning",
        title: `Prepare WSL rootfs archive for ${artifact.serviceId}`,
        detail: `Place or export the rootfs archive at ${artifact.archivePath}, then rerun the WSL import plan.`,
        command: artifact.guideCommand,
        path: artifact.archivePath,
        docs: artifact.docs,
        serviceId: artifact.serviceId,
      });
    }
  }
  for (const port of ports) {
    if (!port.available) {
      messages.push(`Port ${port.port} is already in use for ${port.name}. Stop the conflicting process or change config/defaults/ports.json.`);
      actions.push({
        id: `port:${port.name}`,
        category: "port",
        severity: "error",
        title: `Free port ${port.port} for ${port.name}`,
        detail: `Port ${port.port} on ${port.host} is already in use. Stop the conflicting process or update config/defaults/ports.json.`,
        path: "config/defaults/ports.json",
      });
    }
  }
  for (const path of paths) {
    if (path.required && !path.exists) {
      messages.push(`Required ${path.type} is missing: ${path.path}.`);
      actions.push({
        id: `path:${path.path}`,
        category: "path",
        severity: "error",
        title: `Create missing ${path.type}: ${path.path}`,
        detail: `The required ${path.type} ${path.path} is missing from the portable layout.`,
        path: path.path,
      });
    }
  }
  for (const envFile of envFiles) {
    if (!envFile.exists) {
      messages.push(`Env file missing: ${envFile.path}. To configure ${envFile.serviceId}, copy ${envFile.examplePath} to ${envFile.path}.`);
      actions.push({
        id: `env-file:${envFile.serviceId}`,
        category: "env-file",
        severity: "warning",
        title: `Initialize env file for ${envFile.serviceId}`,
        detail: `Create ${envFile.path} from ${envFile.examplePath} before running the real service.`,
        command: "node core/node/dist/clawhermes.js init-env --dry-run --json",
        path: envFile.path,
        serviceId: envFile.serviceId,
      });
    }
  }
  if (!writable) {
    messages.push("Data directory is not writable.");
    actions.push({
      id: "data:writable",
      category: "data",
      severity: "error",
      title: "Make data directory writable",
      detail: "The launcher must be able to write logs, PID files, env copies, status snapshots, and backups under data/.",
      path: "data",
    });
  }

  return { root, adapters: adapterResults, runtimes, adapterRuntimeRequirements, readiness, ports, paths, envFiles, wsl, wslArtifacts, dataWritable: writable, messages, actions };
}

function wslArtifactDiagnostics(root: string, adapters: ReturnType<typeof loadAdapters>) {
  return adapters.map((adapter) => {
    const distro = adapter.runtime?.sourceDistro?.trim() || adapter.runtime?.distro?.trim() || "Ubuntu";
    const plan = wslImportPlan(root, { distro });
    return {
      serviceId: adapter.id,
      distro: plan.distro,
      distributionName: plan.distributionName,
      archivePath: plan.sourceArchive,
      installLocation: plan.installLocation,
      installLocationExists: plan.installLocationExists,
      sourceArchiveExists: plan.sourceArchiveExists,
      checksum: plan.checksum,
      guideCommand: `node core/node/dist/clawhermes.js wsl-rootfs-guide --distro ${plan.distro} --json`,
      importPlanCommand: `node core/node/dist/clawhermes.js wsl-import-plan --distro ${plan.distro} --json`,
      importCommand: `node core/node/dist/clawhermes.js wsl-import --distro ${plan.distro} --confirm-import --json`,
      docs: plan.docs,
    };
  });
}

function wslPreparationCommand(distro: string | undefined): string {
  const target = distro?.trim();
  return target
    ? `node core/node/dist/clawhermes.js prepare-wsl --distro ${target} --dry-run --json`
    : "node core/node/dist/clawhermes.js prepare-wsl --dry-run --json";
}

export function writeSetupSnapshot(usbRoot: string, setup = setupDiagnostics(usbRoot)) {
  const root = getRoot(usbRoot);
  const snapshotPath = join(root, "data", "tmp", "setup.json");
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(snapshotPath, JSON.stringify(setup, null, 2), "utf8");
  return { path: snapshotPath };
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
  if (target === "portal") return join(root, "data", "logs", "portal.log");
  if (target.startsWith("setup-")) {
    const serviceId = target.slice("setup-".length);
    const adapter = loadAdapters(root).find((item) => item.id === serviceId);
    if (!adapter) throw new Error(`Unknown log target: ${target}`);
    return join(root, "data", "logs", `setup-${serviceId}.log`);
  }
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
  if (tcpPortListedSync(port)) {
    return false;
  }
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

function tcpPortListedSync(port: number): boolean {
  try {
    const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", timeout: 3000 });
    const pattern = new RegExp(`(?:^|\\s)(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[?::1\\]?|\\[?::\\]?):${port}\\s+[^\\r\\n]*\\sLISTENING\\s`, "im");
    return pattern.test(output);
  } catch {
    return false;
  }
}
