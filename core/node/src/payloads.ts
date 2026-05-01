import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadAdapters } from "./adapters";
import { getRoot } from "./portable";
import { wslImportPlan } from "./wsl-import";

type PayloadFile = {
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  sha256Sidecar: {
    path: string;
    exists: boolean;
    value: string | null;
  };
};

export function payloadInventory(usbRoot: string) {
  const root = getRoot(usbRoot);
  const adapters = loadAdapters(root);
  const sourceDistros = [...new Set(adapters
    .filter((adapter) => adapter.runtime?.kind === "wsl2")
    .map((adapter) => adapter.runtime?.sourceDistro?.trim() || adapter.runtime?.distro?.trim() || "Ubuntu"))];

  return {
    root,
    generatedAt: new Date().toISOString(),
    wouldModify: false,
    apps: adapters.map((adapter) => appPayload(root, adapter.id, adapter.appDir)),
    wslRootfs: sourceDistros.map((distro) => {
      const plan = wslImportPlan(root, { distro });
      return {
        distro,
        distributionName: plan.distributionName,
        importLocation: plan.installLocation,
        archive: filePayload(plan.sourceArchive),
      };
    }),
    wslBackups: sourceDistros.map((distro) => {
      const distributionName = `ClawHermes-${safeDistributionSuffix(distro)}`;
      return {
        distro,
        distributionName,
        latest: latestWslBackup(root, distributionName),
      };
    }),
    policy: {
      appsIgnored: "apps/<service-id>/ payloads are ignored except .gitkeep placeholders.",
      rootfsIgnored: "runtimes/wsl/*.tar and sidecars are ignored operator-managed payloads.",
      backupsIgnored: "data/backups/wsl/ exports are ignored runtime artifacts.",
      noAutomaticDownload: true,
    },
    messages: [
      "payloads is read-only and does not download, export, import, or package artifacts.",
      "Use this inventory before building or refreshing a portable payload bundle.",
    ],
  };
}

function appPayload(root: string, serviceId: string, appDir: string) {
  const absolutePath = join(root, appDir);
  const exists = existsSync(absolutePath);
  const entries = exists ? readdirSync(absolutePath).filter((name) => name !== ".gitkeep") : [];
  const git = exists && existsSync(join(absolutePath, ".git")) ? gitSummary(absolutePath) : null;
  return {
    serviceId,
    path: absolutePath,
    exists,
    ready: entries.length > 0,
    entries: entries.length,
    git,
  };
}

function filePayload(path: string): PayloadFile {
  const sidecarPath = `${path}.sha256`;
  const exists = existsSync(path);
  const sidecarExists = existsSync(sidecarPath);
  return {
    path,
    exists,
    sizeBytes: exists ? statSync(path).size : null,
    sha256Sidecar: {
      path: sidecarPath,
      exists: sidecarExists,
      value: sidecarExists ? parseSha256(readFileSync(sidecarPath, "utf8")) : null,
    },
  };
}

function latestWslBackup(root: string, distributionName: string): PayloadFile | null {
  const backupRoot = join(root, "data", "backups", "wsl");
  if (!existsSync(backupRoot)) return null;
  const prefix = `${distributionName}-`;
  const latest = readdirSync(backupRoot)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".tar"))
    .sort()
    .at(-1);
  return latest ? filePayload(join(backupRoot, latest)) : null;
}

function gitSummary(cwd: string) {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8", timeout: 5000 }).trim();
    const status = execFileSync("git", ["status", "--short"], { cwd, encoding: "utf8", timeout: 5000 }).trim();
    return {
      head,
      dirty: status.length > 0,
      statusLines: status ? status.split(/\r?\n/) : [],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      head: null,
      dirty: null,
      statusLines: [],
      error: message,
    };
  }
}

function parseSha256(value: string): string | null {
  const match = value.match(/[A-Fa-f0-9]{64}/);
  return match ? match[0].toLowerCase() : null;
}

function safeDistributionSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Ubuntu";
}
