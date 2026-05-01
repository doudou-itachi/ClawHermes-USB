import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { loadAdapters } from "./adapters";
import { getRoot, resolveRelative } from "./portable";
import { payloadInventory } from "./payloads";

type PayloadExportEntry = {
  path: string;
  kind: "directory" | "file";
  sizeBytes: number | null;
};

export function payloadExport(usbRoot: string, options: { archive?: string; dryRun?: boolean; confirmExport?: boolean } = {}) {
  const root = getRoot(usbRoot);
  const dryRun = options.dryRun ?? false;
  const archivePath = options.archive?.trim() ? resolve(options.archive) : defaultArchivePath(root);
  const entries = payloadEntries(root);
  const manifest = {
    createdAt: new Date().toISOString(),
    root,
    profile: "payloads",
    entries,
    policy: payloadInventory(root).policy,
  };

  const result = {
    root,
    dryRun,
    confirmedExport: options.confirmExport === true,
    archivePath,
    created: false,
    sizeBytes: null as number | null,
    entries,
    wouldModify: !dryRun,
    messages: [
      dryRun
        ? `Payload export dry run planned ${entries.length} entries.`
        : `Prepared payload export with ${entries.length} entries.`,
    ],
  };

  if (dryRun) return result;
  if (!options.confirmExport) {
    throw new Error("payload-export writes a payload archive. Re-run with --confirm-export to proceed.");
  }
  if (isUnderSystemTempOutsideRoot(archivePath, root)) {
    throw new Error(`Refusing to write payload export archive under system temp: ${archivePath}`);
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const stagingRoot = join(root, "data", "tmp", "payload-export", `stage-${timestamp}`);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  try {
    for (const entry of entries) copyEntry(root, stagingRoot, entry);
    writeFileSync(join(stagingRoot, "payload-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    mkdirSync(dirname(archivePath), { recursive: true });
    compressDirectory(stagingRoot, archivePath);
  } finally {
    rmSync(join(root, "data", "tmp", "payload-export"), { recursive: true, force: true });
  }

  return {
    ...result,
    created: true,
    sizeBytes: statSync(archivePath).size,
    messages: [`Created payload export archive at ${archivePath}.`],
  };
}

function payloadEntries(root: string): PayloadExportEntry[] {
  const entries: PayloadExportEntry[] = [];
  for (const adapter of loadAdapters(root)) {
    const appDir = resolveRelative(root, adapter.appDir);
    if (existsSync(appDir) && directoryHasPayload(appDir)) {
      entries.push({ path: normalizeRelative(adapter.appDir), kind: "directory", sizeBytes: null });
    }
  }

  const inventory = payloadInventory(root);
  for (const item of inventory.wslRootfs) {
    pushFile(entries, root, item.archive.path);
    if (item.archive.sha256Sidecar.exists) pushFile(entries, root, item.archive.sha256Sidecar.path);
  }
  for (const item of inventory.wslBackups) {
    if (!item.latest) continue;
    pushFile(entries, root, item.latest.path);
    if (item.latest.sha256Sidecar.exists) pushFile(entries, root, item.latest.sha256Sidecar.path);
  }

  return dedupeEntries(entries).filter((entry) => !entry.path.replaceAll("\\", "/").startsWith("data/tmp"));
}

function pushFile(entries: PayloadExportEntry[], root: string, absolutePath: string): void {
  if (!existsSync(absolutePath)) return;
  entries.push({
    path: relativeToRoot(root, absolutePath),
    kind: "file",
    sizeBytes: statSync(absolutePath).size,
  });
}

function copyEntry(root: string, stagingRoot: string, entry: PayloadExportEntry): void {
  const source = resolveRelative(root, entry.path);
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

function directoryHasPayload(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function dedupeEntries(entries: PayloadExportEntry[]): PayloadExportEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entry.path.replaceAll("\\", "/").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function relativeToRoot(root: string, absolutePath: string): string {
  const relative = resolve(absolutePath).slice(resolve(root).length).replace(/^[\\/]+/, "");
  return normalizeRelative(relative);
}

function normalizeRelative(value: string): string {
  return value.replaceAll("\\", "/");
}

function defaultArchivePath(root: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(root, "data", "backups", "payloads", `clawhermes-payloads-${timestamp}.zip`);
}

function isUnderSystemTempOutsideRoot(path: string, root: string): boolean {
  const temp = resolve(tmpdir()).toLowerCase();
  const target = resolve(path).toLowerCase();
  const projectRoot = resolve(root).toLowerCase();
  const underRoot = target === projectRoot || target.startsWith(`${projectRoot}\\`) || target.startsWith(`${projectRoot}/`);
  const underTemp = target === temp || target.startsWith(`${temp}\\`) || target.startsWith(`${temp}/`);
  return underTemp && !underRoot;
}

function powershellString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
