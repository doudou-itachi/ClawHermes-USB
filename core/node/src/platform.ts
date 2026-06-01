import { join } from "node:path";

export type SupportedPlatform = "windows" | "darwin" | "linux";
export type SupportedArch = "x64" | "arm64";

export type PlatformProbe = {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
};

export type PlatformInfo = {
  id: SupportedPlatform;
  nodePlatform: NodeJS.Platform;
  arch: SupportedArch;
  runtimeKey: string;
  pathSeparator: ";" | ":";
  executableSuffix: string;
};

export function detectPlatform(probe: PlatformProbe = {}): PlatformInfo {
  const nodePlatform = probe.platform ?? process.platform;
  const nodeArch = probe.arch ?? process.arch;
  const id: SupportedPlatform = nodePlatform === "win32" ? "windows" : nodePlatform === "darwin" ? "darwin" : "linux";
  const arch: SupportedArch = nodeArch === "arm64" ? "arm64" : "x64";
  return {
    id,
    nodePlatform,
    arch,
    runtimeKey: id === "darwin" ? `darwin-${arch}` : id,
    pathSeparator: id === "windows" ? ";" : ":",
    executableSuffix: id === "windows" ? ".exe" : "",
  };
}

export function runtimePathEntries(usbRoot: string, info = detectPlatform()): string[] {
  if (info.id === "darwin") {
    return [
      join(usbRoot, "runtimes", "macos", "node", info.runtimeKey, "bin"),
      join(usbRoot, "runtimes", "macos", "python", info.runtimeKey, "bin"),
      join(usbRoot, "runtimes", "macos", "git", info.runtimeKey, "bin"),
    ];
  }
  return [
    join(usbRoot, "runtimes", "windows", "node"),
    join(usbRoot, "runtimes", "windows", "python"),
    join(usbRoot, "runtimes", "windows", "git", "cmd"),
  ];
}
