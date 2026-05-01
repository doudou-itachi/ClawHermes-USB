import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { getRoot } from "./portable";

export type BackupProfile = "data-only" | "full";

export type BackupOptions = {
  profile?: BackupProfile;
  includeLogs?: boolean;
  dryRun?: boolean;
};

export type RestoreOptions = {
  confirmRestore?: boolean;
};

type BackupEntry = {
  path: string;
  kind: "directory" | "file";
};

type BackupManifest = {
  createdAt: string;
  profile: BackupProfile;
  includeLogs: boolean;
  entries: BackupEntry[];
};

export function createBackup(usbRoot: string, options: BackupOptions = {}) {
  const root = getRoot(usbRoot);
  const profile = options.profile ?? "data-only";
  const includeLogs = options.includeLogs ?? false;
  const dryRun = options.dryRun ?? false;
  const backupRoot = join(root, "data", "backups");
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const archivePath = join(backupRoot, `clawhermes-${profile}-${timestamp}.zip`);
  const entries = backupEntries(root, profile, includeLogs);
  const manifest = {
    createdAt: new Date().toISOString(),
    profile,
    includeLogs,
    entries,
  };

  if (dryRun) {
    return {
      root,
      profile,
      includeLogs,
      dryRun,
      archivePath,
      entries,
      created: false,
      sizeBytes: null,
      message: `Backup dry run planned ${entries.length} entries.`,
    };
  }

  mkdirSync(backupRoot, { recursive: true });
  const stagingRoot = join(root, "data", "tmp", "backups", `stage-${timestamp}`);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  try {
    for (const entry of entries) copyEntry(root, stagingRoot, entry);
    writeFileSync(join(stagingRoot, "backup-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    compressDirectory(stagingRoot, archivePath);
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  return {
    root,
    profile,
    includeLogs,
    dryRun,
    archivePath,
    entries,
    created: true,
    sizeBytes: statSync(archivePath).size,
    message: `Created backup archive at ${archivePath}.`,
  };
}

export function restorePlan(usbRoot: string, archivePath: string | undefined) {
  const root = getRoot(usbRoot);
  if (!archivePath) throw new Error("--archive is required for restore-plan.");
  if (!existsSync(archivePath)) throw new Error(`Backup archive not found: ${archivePath}`);
  if (!statSync(archivePath).isFile()) throw new Error(`Backup archive is not a file: ${archivePath}`);
  const manifest = readBackupManifest(archivePath);
  const entries = manifest.entries.map((entry) => validateRestoreEntry(entry));
  const conflicts = entries
    .map((entry) => ({ ...entry, targetPath: join(root, entry.path), targetExists: existsSync(join(root, entry.path)) }))
    .filter((entry) => entry.targetExists);
  return {
    root,
    archivePath,
    manifestPath: "backup-manifest.json",
    manifest,
    entries,
    conflicts,
    wouldModify: false,
    confirmCommand: `node core/node/dist/clawhermes.js restore --archive ${quoteCommandArg(archivePath)} --confirm-restore --json`,
    messages: [
      `Backup archive contains ${entries.length} planned restore entries.`,
      conflicts.length > 0
        ? `${conflicts.length} restore target(s) already exist and would require overwrite handling.`
        : "No existing restore targets were detected.",
      "restore-plan is read-only and does not extract files.",
    ],
  };
}

export function restoreBackup(usbRoot: string, archivePath: string | undefined, options: RestoreOptions = {}) {
  const plan = restorePlan(usbRoot, archivePath);
  if (!options.confirmRestore) {
    throw new Error("restore writes files into the project root. Re-run with --confirm-restore to proceed.");
  }
  if (plan.conflicts.length > 0) {
    throw new Error(`restore target already exists: ${plan.conflicts[0].path}`);
  }
  validateZipEntryNames(plan.archivePath);
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const restoreRoot = join(plan.root, "data", "tmp", "restores");
  const stagingRoot = join(restoreRoot, `stage-${timestamp}`);
  rmSync(restoreRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  try {
    expandArchive(plan.archivePath, stagingRoot);
    for (const entry of plan.entries) {
      const source = join(stagingRoot, entry.path);
      if (!existsSync(source)) throw new Error(`Backup archive is missing expected restore entry: ${entry.path}`);
      const destination = join(plan.root, entry.path);
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(source, destination, { recursive: entry.kind === "directory", force: false });
    }
  } finally {
    rmSync(restoreRoot, { recursive: true, force: true });
  }
  return {
    ...plan,
    confirmedRestore: true,
    executed: true,
    restored: plan.entries,
    messages: [
      `Restored ${plan.entries.length} entries from ${plan.archivePath}.`,
      "Existing targets are never overwritten by this restore command.",
    ],
  };
}

function backupEntries(root: string, profile: BackupProfile, includeLogs: boolean): BackupEntry[] {
  return profile === "full" ? fullBackupEntries(root, includeLogs) : dataOnlyBackupEntries(root, includeLogs);
}

function dataOnlyBackupEntries(root: string, includeLogs: boolean): BackupEntry[] {
  const candidates = [
    "config",
    "adapters",
    join("data", "openclaw"),
    join("data", "hermes"),
    join("data", "hermes-web-ui"),
    join("data", "shared-workspace"),
  ];
  if (includeLogs) candidates.push(join("data", "logs"));
  return existingEntries(root, candidates);
}

function fullBackupEntries(root: string, includeLogs: boolean): BackupEntry[] {
  const excluded = new Set([".git", "node_modules"]);
  const entries: BackupEntry[] = [];
  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (excluded.has(item.name) || item.name === "data") continue;
    entries.push({ path: item.name, kind: item.isDirectory() ? "directory" : "file" });
  }
  const dataItems = readdirSync(join(root, "data"), { withFileTypes: true });
  for (const item of dataItems) {
    if (["backups", "cache", "tmp"].includes(item.name)) continue;
    if (!includeLogs && item.name === "logs") continue;
    entries.push({ path: join("data", item.name), kind: item.isDirectory() ? "directory" : "file" });
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function existingEntries(root: string, candidates: string[]): BackupEntry[] {
  const entries: BackupEntry[] = [];
  for (const relativePath of candidates) {
    const absolutePath = join(root, relativePath);
    if (!existsSync(absolutePath)) continue;
    entries.push({ path: relativePath, kind: statSync(absolutePath).isDirectory() ? "directory" : "file" });
  }
  return entries;
}

function copyEntry(root: string, stagingRoot: string, entry: BackupEntry): void {
  const source = join(root, entry.path);
  const destination = join(stagingRoot, entry.path);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: entry.kind === "directory", force: true });
}

function compressDirectory(stagingRoot: string, archivePath: string): void {
  const script = [
    `$staging = ${powershellString(stagingRoot)}`,
    `$archive = ${powershellString(archivePath)}`,
    "if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }",
    "Compress-Archive -Path (Join-Path -Path $staging -ChildPath '*') -DestinationPath $archive -Force",
  ].join("; ");
  execFileSync("powershell", ["-NoProfile", "-Command", script], { stdio: "pipe" });
}

function readBackupManifest(archivePath: string): BackupManifest {
  const script = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$zip = [System.IO.Compression.ZipFile]::OpenRead(${powershellString(archivePath)})`,
    "try {",
    "  $entry = $zip.GetEntry('backup-manifest.json')",
    "  if ($null -eq $entry) { throw 'backup-manifest.json not found in archive' }",
    "  $stream = $entry.Open()",
    "  try {",
    "    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)",
    "    try { $reader.ReadToEnd() } finally { $reader.Dispose() }",
    "  } finally { $stream.Dispose() }",
    "} finally { $zip.Dispose() }",
  ].join("; ");
  const raw = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 10000 }).trim();
  const parsed = JSON.parse(raw) as BackupManifest;
  if (!Array.isArray(parsed.entries)) throw new Error("Backup manifest entries are missing or invalid.");
  return parsed;
}

function validateZipEntryNames(archivePath: string): void {
  const names = zipEntryNames(archivePath);
  for (const name of names) {
    const normalized = normalize(name);
    if (isAbsolute(name) || normalized === ".." || normalized.startsWith(`..\\`) || normalized.startsWith("../")) {
      throw new Error(`Backup archive contains an unsafe zip entry: ${name}`);
    }
  }
}

function zipEntryNames(archivePath: string): string[] {
  const script = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$zip = [System.IO.Compression.ZipFile]::OpenRead(${powershellString(archivePath)})`,
    "try {",
    "  @($zip.Entries | ForEach-Object { $_.FullName }) | ConvertTo-Json -Compress",
    "} finally { $zip.Dispose() }",
  ].join("; ");
  const raw = execFileSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 10000 }).trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw) as string[] | string;
  return Array.isArray(parsed) ? parsed : [parsed];
}

function expandArchive(archivePath: string, destinationPath: string): void {
  const script = [
    `$archive = ${powershellString(archivePath)}`,
    `$destination = ${powershellString(destinationPath)}`,
    "Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force",
  ].join("; ");
  execFileSync("powershell", ["-NoProfile", "-Command", script], { stdio: "pipe", timeout: 30000 });
}

function validateRestoreEntry(entry: BackupEntry): BackupEntry {
  if (!entry || typeof entry.path !== "string") throw new Error("Backup manifest contains an invalid entry path.");
  if (entry.kind !== "directory" && entry.kind !== "file") throw new Error(`Backup manifest contains an invalid entry kind for ${entry.path}.`);
  const normalized = normalize(entry.path);
  if (isAbsolute(entry.path) || normalized === ".." || normalized.startsWith(`..\\`) || normalized.startsWith("../")) {
    throw new Error(`Backup manifest contains an unsafe restore path: ${entry.path}`);
  }
  return { path: normalized, kind: entry.kind };
}

function quoteCommandArg(value: string): string {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function powershellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
