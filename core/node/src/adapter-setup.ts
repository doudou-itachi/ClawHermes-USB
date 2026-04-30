import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadAdapters } from "./adapters";
import { resolveServiceEnvironment } from "./environment";
import { getRoot, resolveRelative } from "./portable";
import { assertWslReadyForAdapter, wslAdapterSetupPlan } from "./wsl-adapter";

export function runAdapterSetup(usbRoot: string, serviceId: string | undefined, options: { dryRun: boolean; confirm: boolean }) {
  const root = getRoot(usbRoot);
  if (!serviceId) throw new Error("Service id is required. Example: setup-adapter hermes-web-ui --confirm-setup");
  const adapter = loadAdapters(root).find((item) => item.id === serviceId);
  if (!adapter) throw new Error(`Unknown adapter: ${serviceId}`);
  const command = adapter.commands.setup;
  if (!command) throw new Error(`Adapter ${serviceId} does not declare a setup command.`);

  const workingDirectory = resolveRelative(root, adapter.appDir);
  if (!existsSync(workingDirectory) || !directoryHasRealContent(workingDirectory)) {
    throw new Error(`App directory is not ready for setup: ${adapter.appDir}`);
  }

  const serviceEnv = resolveServiceEnvironment(root, serviceId);
  const logFile = resolveRelative(root, `data/logs/setup-${serviceId}.log`);
  const wslPlan = adapter.runtime?.kind === "wsl2" ? wslAdapterSetupPlan(root, adapter, serviceEnv) : null;
  const result = {
    root,
    serviceId,
    displayName: adapter.displayName,
    runner: wslPlan ? "wsl2" : "windows",
    dryRun: options.dryRun,
    confirmed: options.confirm,
    wouldModify: !options.dryRun,
    executed: false,
    command,
    workingDirectory,
    logFile,
    wsl: wslPlan
      ? {
        executablePath: wslPlan.executablePath,
        args: wslPlan.args,
        workingDirectory: wslPlan.workingDirectory,
        script: wslPlan.script,
      }
      : null,
    exitCode: null as number | null,
    environment: {
      files: serviceEnv.files,
      variables: Object.keys(serviceEnv.env).sort(),
    },
    message: options.dryRun ? `Would run setup for ${serviceId}.` : `Ran setup for ${serviceId}.`,
  };

  if (!options.dryRun && !options.confirm) {
    throw new Error("setup-adapter may modify app dependencies. Re-run with --confirm-setup to proceed.");
  }
  if (options.dryRun) return result;

  mkdirSync(dirname(logFile), { recursive: true });
  if (wslPlan) {
    assertWslReadyForAdapter(root, serviceId);
  }
  const completed = wslPlan
    ? spawnSync(wslPlan.executablePath, wslPlan.args, {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      windowsHide: true,
    })
    : spawnSync(command, {
      cwd: workingDirectory,
      env: { ...process.env, ...serviceEnv.env },
      shell: true,
      encoding: "utf8",
      windowsHide: true,
    });
  appendSetupLog(logFile, serviceId, wslPlan ? `wsl ${wslPlan.args.join(" ")}` : command, completed.stdout, completed.stderr, completed.status);
  if (completed.error) throw new Error(`Adapter setup failed: ${completed.error.message}`);
  if (completed.status !== 0) {
    throw new Error(`Adapter setup failed with exit code ${completed.status}: ${(completed.stderr || completed.stdout || "unknown error").trim()}`);
  }
  return { ...result, executed: true, exitCode: completed.status ?? 0 };
}

function appendSetupLog(logFile: string, serviceId: string, command: string, stdout: string, stderr: string, exitCode: number | null): void {
  appendFileSync(
    logFile,
    [
      `${new Date().toISOString()} [${serviceId}] setup command: ${command}`,
      `exitCode: ${exitCode ?? "unknown"}`,
      stdout ? `stdout:\n${stdout}` : "stdout: <empty>",
      stderr ? `stderr:\n${stderr}` : "stderr: <empty>",
      "",
    ].join("\n"),
    "utf8",
  );
}

function directoryHasRealContent(path: string): boolean {
  try {
    return readdirSync(path).some((entry) => entry !== ".gitkeep");
  } catch {
    return false;
  }
}
