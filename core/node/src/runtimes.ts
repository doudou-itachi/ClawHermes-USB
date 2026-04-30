import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { RuntimeDiagnostic, RuntimeInstallResult, RuntimeManifest, RuntimePreparationStep } from "./types";
import { getRoot, resolveRelative } from "./portable";

export function runtimeDiagnostics(usbRoot: string): RuntimeDiagnostic[] {
  const root = getRoot(usbRoot);
  const manifest = loadRuntimeManifest(root);
  return manifest.runtimes.map((runtime) => {
    const resolvedCandidates = runtime.candidates.map((candidate) => resolveRelative(root, candidate));
    const foundPath = resolvedCandidates.find((candidate) => existsSync(candidate)) ?? resolvedCandidates[0];
    return {
      name: runtime.name,
      label: runtime.label,
      path: foundPath,
      found: resolvedCandidates.some((candidate) => existsSync(candidate)),
      versionPolicy: runtime.versionPolicy,
      packageType: runtime.packageType,
      sourceUrl: runtime.sourceUrl,
      installDir: resolveRelative(root, runtime.installDir),
      candidates: resolvedCandidates,
      notes: runtime.notes,
    };
  });
}

export function loadRuntimeManifest(usbRoot: string): RuntimeManifest {
  const manifestPath = join(getRoot(usbRoot), "config", "defaults", "runtimes.json");
  return JSON.parse(readFileSync(manifestPath, "utf8")) as RuntimeManifest;
}

export function runtimePreparationPlan(usbRoot: string) {
  const root = getRoot(usbRoot);
  const manifest = loadRuntimeManifest(root);
  const diagnosticsByName = new Map(runtimeDiagnostics(root).map((runtime) => [runtime.name, runtime]));
  const steps: RuntimePreparationStep[] = manifest.runtimes.map((runtime) => {
    const diagnostic = diagnosticsByName.get(runtime.name);
    return {
      name: runtime.name,
      label: runtime.label,
      action: "extract",
      versionPolicy: runtime.versionPolicy,
      packageType: runtime.packageType,
      sourceUrl: runtime.sourceUrl,
      installDir: resolveRelative(root, runtime.installDir),
      expectedExecutables: runtime.candidates.map((candidate) => resolveRelative(root, candidate)),
      notes: runtime.notes,
      found: diagnostic?.found === true,
    };
  });
  const messages = steps.map((step) => {
    if (step.found) {
      return `${step.label} already present under ${step.installDir}.`;
    }
    return `Download ${step.label} from ${step.sourceUrl}, then extract it into ${step.installDir}. Expected executable: ${step.expectedExecutables[0]}.`;
  });
  return {
    root,
    platform: manifest.platform,
    steps,
    messages,
  };
}

export function installRuntimeFromArchive(usbRoot: string, runtimeName: string, archivePath: string, dryRun: boolean, expectedSha256?: string): RuntimeInstallResult {
  const root = getRoot(usbRoot);
  const manifest = loadRuntimeManifest(root);
  const runtime = manifest.runtimes.find((item) => item.name === runtimeName);
  if (!runtime) {
    throw new Error(`Unknown runtime: ${runtimeName}`);
  }
  const archive = resolve(archivePath);
  if (!existsSync(archive)) {
    throw new Error(`Runtime archive not found: ${archive}`);
  }
  if (!archive.toLowerCase().endsWith(".zip")) {
    throw new Error(`Only .zip runtime archives are supported right now: ${archive}`);
  }
  const actualSha256 = sha256File(archive);
  if (expectedSha256 && actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error(`SHA256 mismatch for ${archive}. Expected ${expectedSha256}, got ${actualSha256}.`);
  }
  const installDir = resolveRelative(root, runtime.installDir);
  const expectedExecutables = runtime.candidates.map((candidate) => resolveRelative(root, candidate));

  if (!dryRun) {
    mkdirSync(installDir, { recursive: true });
    const tempDir = join(root, "data", "tmp", "runtime-extract", `${runtime.name}-${Date.now()}`);
    rmSync(tempDir, { recursive: true, force: true });
    mkdirSync(tempDir, { recursive: true });
    try {
      execFileSync("powershell", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Expand-Archive",
        "-LiteralPath",
        archive,
        "-DestinationPath",
        tempDir,
        "-Force",
      ], { stdio: "ignore" });
      copyExtractedRuntime(tempDir, installDir);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const installed = expectedExecutables.some((candidate) => existsSync(candidate));
  return {
    runtime: runtime.name,
    dryRun,
    archive,
    installDir,
    expectedExecutables,
    sha256: expectedSha256 ?? null,
    checksumVerified: expectedSha256 ? true : null,
    wouldExtract: true,
    installed,
    message: dryRun
      ? `Would extract ${archive} into ${installDir}.`
      : installed
        ? `Installed ${runtime.label} into ${installDir}.`
        : `Extracted ${archive}, but no expected executable was found under ${installDir}.`,
  };
}

function sha256File(file: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(file));
  return hash.digest("hex");
}

function copyExtractedRuntime(sourceDir: string, installDir: string): void {
  const entries = readdirSync(sourceDir, { withFileTypes: true });
  const contentRoot = entries.length === 1 && entries[0]?.isDirectory()
    ? join(sourceDir, entries[0].name)
    : sourceDir;
  copyDirectoryContents(contentRoot, installDir);
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const source = join(sourceDir, entry.name);
    const target = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(source, target);
    } else if (entry.isFile()) {
      writeFileSync(target, readFileSync(source));
    }
  }
}
