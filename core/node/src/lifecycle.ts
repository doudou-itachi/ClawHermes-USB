import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AdapterDescriptor, ServiceEnvironment } from "./types";
import { resolveServiceEnvironment } from "./environment";
import { resolveRelative, writeLog } from "./portable";

export function startAdapter(root: string, adapter: AdapterDescriptor) {
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
  return metadata;
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

export function stopAdapter(root: string, adapter: AdapterDescriptor): boolean {
  const pidFile = resolveRelative(root, adapter.pidFile);
  if (!existsSync(pidFile)) return false;

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
  return true;
}

export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    process.kill(pid, "SIGTERM");
  }
}
