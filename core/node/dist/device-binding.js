"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceBindingPath = deviceBindingPath;
exports.getDeviceBindingStatus = getDeviceBindingStatus;
exports.ensureDeviceBinding = ensureDeviceBinding;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
const FINGERPRINT_ENV = "CLAWHERMES_DEVICE_BINDING_FINGERPRINT";
function deviceBindingPath(usbRoot) {
    return (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "data", "settings", "device-binding.json");
}
function getDeviceBindingStatus(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
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
function ensureDeviceBinding(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const status = getDeviceBindingStatus(root);
    if (status.state === "mismatch") {
        throw new Error("This ClawHermes package is bound to another USB device. Use the original bound USB device or rebuild a fresh delivery package.");
    }
    if (status.state === "bound")
        return status;
    const binding = {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        rootAtBinding: root,
        fingerprint: status.current,
    };
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(status.bindingPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(status.bindingPath, `${JSON.stringify(binding, null, 2)}\n`, "utf8");
    return getDeviceBindingStatus(root);
}
function readDeviceBinding(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"));
        if (parsed?.schemaVersion !== 1 || !parsed.fingerprint?.hash)
            return null;
        return parsed;
    }
    catch {
        return null;
    }
}
function currentDeviceFingerprint(root) {
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
        if (windowsFingerprint)
            return windowsFingerprint;
    }
    const driveRoot = (0, node_path_1.parse)(root).root || root;
    return {
        hash: sha256(`fallback:${driveRoot.toLowerCase()}`),
        source: "fallback",
        summary: `Fallback root fingerprint for ${driveRoot}`,
    };
}
function windowsDeviceFingerprint(root) {
    const driveLetter = /^([A-Za-z]):/.exec((0, node_path_1.parse)(root).root)?.[1];
    if (!driveLetter)
        return null;
    const components = {
        vol: readVolSerial(driveLetter),
        volume: readWindowsVolume(driveLetter),
        disk: readWindowsDisk(driveLetter),
    };
    if (!components.volume && !components.disk && !components.vol)
        return null;
    return {
        hash: sha256(stableStringify(components)),
        source: "windows",
        summary: `Windows USB fingerprint for drive ${driveLetter.toUpperCase()}:`,
    };
}
function readWindowsVolume(driveLetter) {
    return runPowerShellJson(`$v = Get-Volume -DriveLetter '${driveLetter}' -ErrorAction Stop | Select-Object DriveLetter,FileSystemLabel,FileSystem,DriveType,UniqueId,SerialNumber; $v | ConvertTo-Json -Depth 4`);
}
function readWindowsDisk(driveLetter) {
    return runPowerShellJson(`$p = Get-Partition -DriveLetter '${driveLetter}' -ErrorAction Stop; $d = $p | Get-Disk -ErrorAction Stop | Select-Object Number,FriendlyName,SerialNumber,UniqueId,BusType; $d | ConvertTo-Json -Depth 4`);
}
function runPowerShellJson(script) {
    try {
        const powershell = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
        const stdout = (0, node_child_process_1.execFileSync)(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
            encoding: "utf8",
            windowsHide: true,
            timeout: 2500,
        }).trim();
        return stdout ? JSON.parse(stdout) : null;
    }
    catch {
        return null;
    }
}
function readVolSerial(driveLetter) {
    try {
        return (0, node_child_process_1.execFileSync)("cmd.exe", ["/c", "vol", `${driveLetter}:`], {
            encoding: "utf8",
            windowsHide: true,
            timeout: 1500,
        }).trim();
    }
    catch {
        return null;
    }
}
function stableStringify(value) {
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== "")
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
function sha256(value) {
    return (0, node_crypto_1.createHash)("sha256").update(value).digest("hex");
}
