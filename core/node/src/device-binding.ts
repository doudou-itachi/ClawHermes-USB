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
  fingerprints?: DeviceFingerprint[];
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
  const matches = bindingFingerprints(binding).some((fingerprint) => fingerprint.hash === current.hash);
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
    if (status.binding && canAppendCrossPlatformFingerprint(status.binding, status.current)) {
      writeDeviceBinding(status.bindingPath, appendFingerprint(status.binding, status.current, root));
      return getDeviceBindingStatus(root);
    }
    throw new Error("This ClawHermes package is bound to another USB device. Use the original bound USB device or rebuild a fresh delivery package.");
  }
  if (status.state === "bound") return status;
  const binding: DeviceBindingFile = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    rootAtBinding: root,
    fingerprint: status.current,
    fingerprints: [status.current],
  };
  writeDeviceBinding(status.bindingPath, binding);
  return getDeviceBindingStatus(root);
}

function writeDeviceBinding(path: string, binding: DeviceBindingFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
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

function bindingFingerprints(binding: DeviceBindingFile): DeviceFingerprint[] {
  return dedupeFingerprints([binding.fingerprint, ...(binding.fingerprints ?? [])].filter(Boolean));
}

function canAppendCrossPlatformFingerprint(binding: DeviceBindingFile, current: DeviceFingerprint): boolean {
  if (current.source === "env") return false;
  return bindingFingerprints(binding).some((fingerprint) => fingerprint.source !== "env" && fingerprint.source !== current.source);
}

function appendFingerprint(binding: DeviceBindingFile, current: DeviceFingerprint, root: string): DeviceBindingFile {
  return {
    ...binding,
    rootAtBinding: binding.rootAtBinding || root,
    fingerprints: dedupeFingerprints([...bindingFingerprints(binding), current]),
  };
}

function dedupeFingerprints(fingerprints: DeviceFingerprint[]): DeviceFingerprint[] {
  const seen = new Set<string>();
  const result: DeviceFingerprint[] = [];
  for (const fingerprint of fingerprints) {
    if (!fingerprint?.hash || seen.has(fingerprint.hash)) continue;
    seen.add(fingerprint.hash);
    result.push(fingerprint);
  }
  return result;
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
  const logicalDisk = readWindowsLogicalDisk(driveLetter);
  const volumeSerialNumber = normalizeVolumeSerial(logicalDisk?.VolumeSerialNumber) ?? readVolSerial(driveLetter);
  if (!volumeSerialNumber) return null;
  const components = {
    volumeSerialNumber,
    fileSystem: normalizeString(logicalDisk?.FileSystem),
  };
  return {
    hash: sha256(`windows-volume:${stableStringify(components)}`),
    source: "windows",
    summary: `Windows volume serial fingerprint for drive ${driveLetter.toUpperCase()}:`,
  };
}

type WindowsLogicalDisk = {
  VolumeSerialNumber?: unknown;
  FileSystem?: unknown;
};

function readWindowsLogicalDisk(driveLetter: string): WindowsLogicalDisk | null {
  const escapedDrive = `${driveLetter.toUpperCase()}:`.replace(/'/g, "''");
  return runPowerShellJson(
    `$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${escapedDrive}'" -ErrorAction Stop | Select-Object VolumeSerialNumber,FileSystem; $d | ConvertTo-Json -Depth 3`,
  ) as WindowsLogicalDisk | null;
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
    const stdout = execFileSync("cmd.exe", ["/c", "vol", `${driveLetter}:`], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1500,
    }).trim();
    return normalizeVolumeSerial(stdout.match(/[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}/)?.[0]);
  } catch {
    return null;
  }
}

function normalizeVolumeSerial(value: unknown): string | null {
  const normalized = normalizeString(value)?.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
  return normalized ? normalized : null;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
