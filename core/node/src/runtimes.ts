import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AdapterDescriptor, AdapterRuntimeRequirementDiagnostic, RuntimeDiagnostic, RuntimeInstallResult, RuntimeManifest, RuntimePreparationStep } from "./types";
import { loadAdapters } from "./adapters";
import { getRoot, resolveRelative } from "./portable";

export function runtimeDiagnostics(usbRoot: string): RuntimeDiagnostic[] {
  const root = getRoot(usbRoot);
  const manifest = loadRuntimeManifest(root);
  return manifest.runtimes.map((runtime) => {
    const resolvedCandidates = runtime.candidates.map((candidate) => resolveRelative(root, candidate));
    const foundPath = resolvedCandidates.find((candidate) => existsSync(candidate)) ?? resolvedCandidates[0];
    const found = resolvedCandidates.some((candidate) => existsSync(candidate));
    return {
      name: runtime.name,
      label: runtime.label,
      path: foundPath,
      found,
      version: found ? runtimeVersion(foundPath) : null,
      versionPolicy: runtime.versionPolicy,
      packageType: runtime.packageType,
      sourceUrl: runtime.sourceUrl,
      installDir: resolveRelative(root, runtime.installDir),
      candidates: resolvedCandidates,
      notes: runtime.notes,
    };
  });
}

export function adapterRuntimeRequirementDiagnostics(usbRoot: string, adapters: AdapterDescriptor[]): AdapterRuntimeRequirementDiagnostic[] {
  const runtimes = new Map(runtimeDiagnostics(usbRoot).map((runtime) => [runtime.name, runtime]));
  return adapters
    .filter((adapter) => adapter.runtime)
    .map((adapter) => {
      const runtime = adapter.runtime!;
      const diagnostic = runtimes.get(runtime.kind);
      const versionRequirement = runtime.versionRequirement ?? null;
      const satisfies = versionRequirement && diagnostic?.version
        ? satisfiesVersionRequirement(diagnostic.version, versionRequirement)
        : versionRequirement
          ? false
          : null;
      return {
        serviceId: adapter.id,
        runtime: runtime.kind,
        requiredExecutable: runtime.requiredExecutable,
        versionRequirement,
        executablePath: diagnostic?.path ?? null,
        found: diagnostic?.found === true,
        version: diagnostic?.version ?? null,
        satisfies,
        message: runtimeRequirementMessage(adapter.id, runtime.kind, diagnostic?.version ?? null, versionRequirement, satisfies),
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
  const adapters = loadAdapters(root);
  const diagnosticsByName = new Map(runtimeDiagnostics(root).map((runtime) => [runtime.name, runtime]));
  const adapterRuntimeRequirements = adapterRuntimeRequirementDiagnostics(root, adapters);
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
    adapterRuntimeRequirements,
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

function runtimeVersion(executablePath: string): string | null {
  try {
    const output = execFileSync(executablePath, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true }).trim();
    return output.replace(/^v/i, "");
  } catch {
    return null;
  }
}

function satisfiesVersionRequirement(version: string, requirement: string): boolean {
  const match = requirement.trim().match(/^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return false;
  return compareVersions(version, [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]) >= 0;
}

function compareVersions(version: string, required: [number, number, number]): number {
  const match = version.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  const actual: [number, number, number] = match
    ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
    : [0, 0, 0];
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] !== required[index]) return actual[index] - required[index];
  }
  return 0;
}

function runtimeRequirementMessage(serviceId: string, runtime: string, version: string | null, requirement: string | null, satisfies: boolean | null): string {
  if (!requirement) return `Adapter ${serviceId} does not declare a ${runtime} version requirement.`;
  if (!version) return `Adapter ${serviceId} requires ${runtime} ${requirement}, but no installed version was detected.`;
  if (satisfies) return `Adapter ${serviceId} requires ${runtime} ${requirement}; installed version ${version} satisfies it.`;
  return `Adapter ${serviceId} requires ${runtime} ${requirement}; installed version ${version} does not satisfy it.`;
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
