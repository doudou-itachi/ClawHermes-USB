import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { getRoot } from "./portable";

export type DeviceFingerprint = {
  hash: string;
  source: "env" | "windows" | "fallback";
  summary: string;
};

export type DeviceBindingStatus = {
  root: string;
  bindingPath: string;
  state: "unbound" | "bound" | "mismatch";
  allowed: boolean;
  current: DeviceFingerprint;
  binding: DeviceBindingFile | null;
  messages: string[];
};

type DeviceBindingFile = {
  schemaVersion: 1;
  createdAt: string;
  rootAtBinding: string;
  fingerprint: DeviceFingerprint;
};

const FINGERPRINT_ENV = "CLAWHERMES_DEVICE_BINDING_FINGERPRINT";

export function deviceBindingPath(usbRoot: string): string {
  return join(getRoot(usbRoot), "data", "settings", "device-binding.json");
}

export function getDeviceBindingStatus(usbRoot: string): DeviceBindingStatus {
  const root = getRoot(usbRoot);
  const bindingPath = deviceBindingPath(root);
  const current = currentDeviceFingerprint(root);
  const binding = readDeviceBinding(bindingPath);
  if (!binding) {
    return {
      root,
      bindingPath,
      state: "unbound",
      allowed: true,
      current,
      binding: null,
      messages: ["This package has not been bound to a USB device yet."],
    };
  }
  const matches = binding.fingerprint.hash === current.hash;
  return {
    root,
    bindingPath,
    state: matches ? "bound" : "mismatch",
    allowed: matches,
    current,
    binding,
    messages: matches
      ? ["Device binding matches the current USB device."]
      : ["This package is bound to another USB device."],
  };
}

export function ensureDeviceBinding(usbRoot: string): DeviceBindingStatus {
  const root = getRoot(usbRoot);
  const status = getDeviceBindingStatus(root);
  if (status.state === "mismatch") {
    throw new Error("This ClawHermes package is bound to another USB device. Use the original bound USB device or rebuild a fresh delivery package.");
  }
  if (status.state === "bound") return status;
  const binding: DeviceBindingFile = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    rootAtBinding: root,
    fingerprint: status.current,
  };
  mkdirSync(dirname(status.bindingPath), { recursive: true });
  writeFileSync(status.bindingPath, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
  return getDeviceBindingStatus(root);
}

function readDeviceBinding(path: string): DeviceBindingFile | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as DeviceBindingFile;
    if (parsed?.schemaVersion !== 1 || !parsed.fingerprint?.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

function currentDeviceFingerprint(root: string): DeviceFingerprint {
  const envValue = process.env[FINGERPRINT_ENV];
  if (envValue?.trim()) {
    return {
      hash: sha256(`env:${envValue.trim()}`),
      source: "env",
      summary: "Test-provided device fingerprint.",
    };
  }
  if (process.platform === "win32") {
    const windowsFingerprint = windowsDeviceFingerprint(root);
    if (windowsFingerprint) return windowsFingerprint;
  }
  const driveRoot = parse(root).root || root;
  return {
    hash: sha256(`fallback:${driveRoot.toLowerCase()}`),
    source: "fallback",
    summary: `Fallback root fingerprint for ${driveRoot}`,
  };
}

function windowsDeviceFingerprint(root: string): DeviceFingerprint | null {
  const driveLetter = /^([A-Za-z]):/.exec(parse(root).root)?.[1];
  if (!driveLetter) return null;
  const components = {
    vol: readVolSerial(driveLetter),
    volume: readWindowsVolume(driveLetter),
    disk: readWindowsDisk(driveLetter),
  };
  if (!components.volume && !components.disk && !components.vol) return null;
  return {
    hash: sha256(stableStringify(components)),
    source: "windows",
    summary: `Windows USB fingerprint for drive ${driveLetter.toUpperCase()}:`,
  };
}

function readWindowsVolume(driveLetter: string): unknown {
  return runPowerShellJson(
    `$v = Get-Volume -DriveLetter '${driveLetter}' -ErrorAction Stop | Select-Object DriveLetter,FileSystemLabel,FileSystem,DriveType,UniqueId,SerialNumber; $v | ConvertTo-Json -Depth 4`,
  );
}

function readWindowsDisk(driveLetter: string): unknown {
  return runPowerShellJson(
    `$p = Get-Partition -DriveLetter '${driveLetter}' -ErrorAction Stop; $d = $p | Get-Disk -ErrorAction Stop | Select-Object Number,FriendlyName,SerialNumber,UniqueId,BusType; $d | ConvertTo-Json -Depth 4`,
  );
}

function runPowerShellJson(script: string): unknown {
  try {
    const powershell = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    const stdout = execFileSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 2500,
    }).trim();
    return stdout ? JSON.parse(stdout) : null;
  } catch {
    return null;
  }
}

function readVolSerial(driveLetter: string): string | null {
  try {
    return execFileSync("cmd.exe", ["/c", "vol", `${driveLetter}:`], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1500,
    }).trim();
  } catch {
    return null;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
