import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export function getRoot(usbRoot: string): string {
  return resolve(usbRoot);
}

export function resolveRelative(usbRoot: string, relativePath: string): string {
  return join(getRoot(usbRoot), ...relativePath.replaceAll("\\", "/").split("/").filter(Boolean));
}

export function portableEnv(usbRoot: string): Record<string, string> {
  const root = getRoot(usbRoot);
  return {
    USB_ROOT: root,
    HOME: join(root, "data", "home"),
    USERPROFILE: join(root, "data", "home"),
    APPDATA: join(root, "data", "home", "AppData", "Roaming"),
    LOCALAPPDATA: join(root, "data", "home", "AppData", "Local"),
    TEMP: join(root, "data", "tmp"),
    TMP: join(root, "data", "tmp"),
    HERMES_HOME: join(root, "data", "hermes"),
    npm_config_cache: join(root, "data", "cache", "npm"),
    PIP_CACHE_DIR: join(root, "data", "cache", "pip"),
    UV_CACHE_DIR: join(root, "data", "cache", "uv"),
    PATH: [
      join(root, "runtimes", "windows", "node"),
      join(root, "runtimes", "windows", "python"),
      join(root, "runtimes", "windows", "git", "cmd"),
      process.env.PATH ?? "",
    ].join(";"),
  };
}

export function dataWritable(usbRoot: string): boolean {
  const tmp = join(getRoot(usbRoot), "data", "tmp");
  mkdirSync(tmp, { recursive: true });
  const probe = join(tmp, "write-probe.tmp");
  try {
    writeFileSync(probe, "ok");
    rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function writeLog(usbRoot: string, serviceId: string, level: string, message: string): void {
  const logDir = join(getRoot(usbRoot), "data", "logs");
  mkdirSync(logDir, { recursive: true });
  appendFileSync(join(logDir, "launcher.log"), `${new Date().toISOString()} [${serviceId}] [${level}] ${message}\n`);
}
