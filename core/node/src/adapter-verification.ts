import { existsSync, readdirSync } from "node:fs";
import type { AdapterDescriptor } from "./types";
import { loadAdapters } from "./adapters";
import { envFileDiagnostics } from "./environment";
import { getRoot, resolveRelative } from "./portable";
import { adapterHealth } from "./status";
import { wslDiagnostics } from "./wsl";
import type { WslDiagnostic } from "./types";

type VerificationStatus = "pass" | "fail" | "warn";

type VerificationCheck = {
  id: string;
  label: string;
  status: VerificationStatus;
  message: string;
};

export function verifyAdapter(
  usbRoot: string,
  serviceId: string | undefined,
  options: { wslDiagnosticsByDistro?: Map<string, WslDiagnostic>; wslCommandTimeoutMs?: number; probeHealth?: boolean } = {},
) {
  const root = getRoot(usbRoot);
  if (!serviceId) throw new Error("Service id is required. Example: verify-adapter hermes-web-ui");
  const adapter = loadAdapters(root).find((item) => item.id === serviceId);
  if (!adapter) throw new Error(`Unknown adapter: ${serviceId}`);

  const checks: VerificationCheck[] = [];
  const appDirPath = resolveRelative(root, adapter.appDir);
  const appDirReady = existsSync(appDirPath) && directoryHasRealContent(appDirPath);
  checks.push(check("app-dir-ready", "App directory", appDirReady, appDirReady ? `App directory contains real content: ${adapter.appDir}` : `App directory is missing or placeholder-only: ${adapter.appDir}`));

  const setupCommand = Boolean(adapter.commands.setup);
  checks.push(check("setup-command", "Setup command", setupCommand, setupCommand ? `Setup command is declared: ${adapter.commands.setup}` : "Setup command is missing."));

  const setupLog = resolveRelative(root, `data/logs/setup-${adapter.id}.log`);
  const setupOutput = existsSync(setupLog);
  checks.push(check("setup-output", "Setup output", setupOutput, setupOutput ? `Setup log exists: data/logs/setup-${adapter.id}.log` : `Setup log is missing: data/logs/setup-${adapter.id}.log`));

  const startCommand = Boolean(adapter.commands.start);
  checks.push(check("start-command", "Start command", startCommand, startCommand ? `Start command is declared: ${adapter.commands.start}` : "Start command is missing."));

  const envFiles = envFileDiagnostics(root, [adapter]);
  const envReady = envFiles.every((file) => file.exists);
  checks.push(check("env-files", "Env files", envReady, envReady ? "All declared env files exist." : "One or more declared env files are missing."));

  const healthDeclared = Boolean(adapter.health?.type);
  checks.push(check("health-declared", "Health declaration", healthDeclared, healthDeclared ? `Health check type is ${adapter.health?.type}.` : "Health check is missing."));

  const wsl = adapter.runtime?.kind === "wsl2"
    ? cachedWslDiagnostics(root, adapter.runtime.distro, options)
    : null;
  if (wsl) {
    checks.push(check(
      "wsl-executable",
      "WSL executable",
      wsl.found,
      wsl.found ? `WSL executable is available: ${wsl.executablePath}` : wsl.messages.join(" "),
    ));
    const targetReady = adapter.runtime?.distro
      ? wsl.hasDesiredDistro && wsl.desiredDistroVersion === 2
      : wsl.hasWsl2Distro;
    checks.push(check(
      "wsl-target-distro",
      "WSL2 target distribution",
      targetReady,
      targetReady
        ? `WSL2 target distribution is ready: ${adapter.runtime?.distro ?? wsl.defaultDistro}.`
        : wsl.messages.join(" "),
    ));
  }

  const health = healthBehavior(adapter, options.probeHealth !== false);
  checks.push({
    id: "health-behavior",
    label: "Health behavior",
    status: health.ready ? "pass" : "fail",
    message: health.reason,
  });

  const productionReadyCandidate = checks.every((item) => item.status === "pass");
  return {
    root,
    serviceId,
    displayName: adapter.displayName,
    generatedAt: new Date().toISOString(),
    productionReadyCandidate,
    checks,
    envFiles: envFiles.map((file) => ({
      path: file.path,
      exists: file.exists,
      examplePath: file.examplePath,
      exampleExists: file.exampleExists,
    })),
    wsl,
    health,
    nextSteps: checks.filter((item) => item.status !== "pass").map((item) => item.message),
  };
}

function cachedWslDiagnostics(
  root: string,
  distro: string | undefined,
  options: { wslDiagnosticsByDistro?: Map<string, WslDiagnostic>; wslCommandTimeoutMs?: number },
): WslDiagnostic {
  const cache = options.wslDiagnosticsByDistro;
  if (!cache) return wslDiagnostics(root, distro, { commandTimeoutMs: options.wslCommandTimeoutMs });
  const key = distro?.trim().toLowerCase() || "<default>";
  const cached = cache.get(key);
  if (cached) return cached;
  const diagnostics = wslDiagnostics(root, distro, { commandTimeoutMs: options.wslCommandTimeoutMs });
  cache.set(key, diagnostics);
  return diagnostics;
}

function check(id: string, label: string, passed: boolean, message: string): VerificationCheck {
  return {
    id,
    label,
    status: passed ? "pass" : "fail",
    message,
  };
}

function healthBehavior(adapter: AdapterDescriptor, probeHealth: boolean) {
  if (!adapter.health?.type) return { type: "unknown", ready: false, reason: "Health check is missing." };
  if (adapter.health.type === "process") return { type: "process", ready: Boolean(adapter.commands.start), reason: adapter.commands.start ? "Process health can be verified by managed startup." : "Process health requires a start command." };
  if (!probeHealth) return { type: adapter.health.type, ready: false, reason: "Health behavior probe was skipped for this lightweight verification snapshot." };
  return adapterHealth(adapter, "running", false);
}

function directoryHasRealContent(path: string): boolean {
  try {
    return readdirSync(path).some((entry) => entry !== ".gitkeep");
  } catch {
    return false;
  }
}
