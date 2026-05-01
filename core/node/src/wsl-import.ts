import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { getRoot } from "./portable";
import { resolveWslExecutable, wslDiagnostics, wslExecutableInvocation } from "./wsl";

const WSL_COMMAND_DOCS = "https://learn.microsoft.com/en-us/windows/wsl/basic-commands";

export function wslImportPlan(usbRoot: string, options: { distro?: string }) {
  const root = getRoot(usbRoot);
  const distro = normalizeDistro(options.distro) ?? "Ubuntu";
  const distributionName = `ClawHermes-${safeDistributionSuffix(distro)}`;
  const installLocation = join(root, "data", "wsl", distributionName);
  const artifactDirectory = join(root, "runtimes", "wsl");
  const archiveName = `${distro.toLowerCase()}-rootfs.tar`;
  const sourceArchive = join(artifactDirectory, archiveName);
  const checksumFile = `${sourceArchive}.sha256`;
  const args = ["--import", distributionName, installLocation, sourceArchive, "--version", "2"];
  const checksum = checksumStatus(sourceArchive, checksumFile);
  return {
    root,
    distro,
    distributionName,
    installLocation,
    installLocationExists: existsSync(installLocation),
    sourceArchive,
    sourceArchiveExists: existsSync(sourceArchive),
    checksum,
    artifactPolicy: {
      directory: artifactDirectory,
      archiveName,
      checksumFile,
      automaticDownload: false,
      managedBy: "operator",
      allowedFileTypes: [".tar"],
      mustRemainProjectLocal: true,
      mustNotUseSystemTemp: true,
    },
    dryRun: true,
    executed: false,
    wouldModifyHost: true,
    wouldUseProjectStorage: true,
    executablePath: "wsl.exe",
    args,
    command: ["wsl.exe", ...args.map(quoteCommandArg)].join(" "),
    docs: WSL_COMMAND_DOCS,
    messages: [
      `This plan stores the imported distribution files under the project path: ${installLocation}.`,
      `The distribution name ${distributionName} is still registered on this Windows host.`,
      `Place a compatible rootfs tar archive at ${sourceArchive} before running the import command yourself.`,
      `Place the matching SHA256 file at ${checksumFile} when one is available from the artifact source.`,
      "No automatic rootfs download is performed; keep large rootfs artifacts out of git and outside system temp folders.",
      "This command is read-only and does not run wsl.exe.",
    ],
  };
}

export function wslRootfsGuide(usbRoot: string, options: { distro?: string }) {
  const plan = wslImportPlan(usbRoot, options);
  const archivePath = plan.sourceArchive;
  const checksumPath = plan.checksum.path;
  return {
    root: plan.root,
    distro: plan.distro,
    archivePath,
    checksumPath,
    automaticDownload: false,
    sourceStrategy: "manual-export",
    exportCommand: `wsl.exe --export ${plan.distro} ${quoteCommandArg(archivePath)}`,
    checksumCommand: `Get-FileHash -Algorithm SHA256 -LiteralPath ${quotePowerShellArg(archivePath)} | ForEach-Object { "$($_.Hash.ToLowerInvariant())  ${plan.artifactPolicy.archiveName}" } | Set-Content -Encoding UTF8 -LiteralPath ${quotePowerShellArg(checksumPath)}`,
    nextCommands: [
      `node core/node/dist/clawhermes.js wsl-import-plan --distro ${plan.distro} --json`,
      `node core/node/dist/clawhermes.js wsl-import --distro ${plan.distro} --confirm-import --json`,
    ],
    docs: WSL_COMMAND_DOCS,
    messages: [
      "ClawHermes-USB does not download, build, or vendor WSL rootfs archives.",
      `Export a user-managed, initialized ${plan.distro} distribution to ${archivePath}.`,
      `Create a SHA256 sidecar at ${checksumPath} before importing when possible.`,
      "Keep the archive under runtimes/wsl/ and outside system temp folders.",
    ],
  };
}

export function wslImport(usbRoot: string, options: { distro?: string; confirmImport: boolean }) {
  const plan = wslImportPlan(usbRoot, options);
  const result = {
    ...plan,
    dryRun: false,
    confirmedImport: options.confirmImport,
    executed: false,
    stdout: "",
    stderr: "",
  };
  if (!options.confirmImport) {
    throw new Error("wsl-import modifies the current Windows host. Re-run with --confirm-import to proceed.");
  }
  if (!plan.sourceArchiveExists) {
    throw new Error(`Missing WSL rootfs archive: ${plan.sourceArchive}`);
  }
  if (plan.installLocationExists) {
    throw new Error(`WSL install location already exists: ${plan.installLocation}`);
  }
  if (plan.checksum.exists && !plan.checksum.verified) {
    throw new Error(`SHA256 mismatch for WSL rootfs archive: expected ${plan.checksum.expected}, got ${plan.checksum.actual}`);
  }
  const executablePath = resolveWslExecutable();
  if (!executablePath) {
    throw new Error("wsl.exe not found. Install or enable WSL2 before importing a distribution.");
  }
  const diagnostics = wslDiagnostics(plan.root);
  const registered = diagnostics.distros.find((item) => item.name.toLowerCase() === plan.distributionName.toLowerCase());
  if (diagnostics.listSucceeded && registered) {
    throw new Error(`WSL distribution is already registered: ${plan.distributionName}`);
  }
  const invocation = wslExecutableInvocation(executablePath, plan.args);
  const stdout = execFileSync(invocation.executablePath, invocation.args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  return {
    ...result,
    executablePath,
    executed: true,
    stdout: stdout.trim(),
    messages: [
      ...plan.messages,
      `Executed WSL import for ${plan.distributionName}.`,
    ],
  };
}

export function wslUnregisterPlan(usbRoot: string, options: { distro?: string }) {
  const plan = wslImportPlan(usbRoot, options);
  const diagnostics = wslDiagnostics(plan.root);
  const registered = diagnostics.distros.some((item) => item.name.toLowerCase() === plan.distributionName.toLowerCase());
  const backupArchive = join(plan.root, "data", "backups", "wsl", `${plan.distributionName}-backup.tar`);
  const args = ["--unregister", plan.distributionName];
  return {
    root: plan.root,
    distro: plan.distro,
    distributionName: plan.distributionName,
    registered,
    diagnostics,
    backupArchive,
    backupCommand: `wsl.exe --export ${plan.distributionName} ${quoteCommandArg(backupArchive)}`,
    dryRun: true,
    executed: false,
    wouldModifyHost: true,
    destructive: true,
    executablePath: "wsl.exe",
    args,
    command: ["wsl.exe", ...args.map(quoteCommandArg)].join(" "),
    confirmCommand: `node core/node/dist/clawhermes.js wsl-unregister --distro ${plan.distro} --confirm-unregister --json`,
    docs: WSL_COMMAND_DOCS,
    warnings: [
      `Unregistering ${plan.distributionName} permanently deletes that WSL distribution and its Linux filesystem from this Windows host.`,
      `Export a backup first with: wsl.exe --export ${plan.distributionName} ${quoteCommandArg(backupArchive)}`,
      "This command is read-only and does not run wsl.exe.",
    ],
    messages: registered
      ? [`Distribution is registered on this host: ${plan.distributionName}.`]
      : [`Distribution is not registered on this host: ${plan.distributionName}.`],
  };
}

export function wslExport(usbRoot: string, options: { distro?: string; archive?: string; confirmExport: boolean }) {
  const plan = wslImportPlan(usbRoot, options);
  const backupArchive = options.archive?.trim() ? resolve(options.archive) : defaultBackupArchive(plan.root, plan.distributionName);
  const args = ["--export", plan.distributionName, backupArchive];
  const result = {
    root: plan.root,
    distro: plan.distro,
    distributionName: plan.distributionName,
    backupArchive,
    dryRun: false,
    confirmedExport: options.confirmExport,
    executed: false,
    wouldModifyProject: true,
    executablePath: "wsl.exe",
    args,
    command: ["wsl.exe", ...args.map(quoteCommandArg)].join(" "),
    stdout: "",
    stderr: "",
    messages: [`Prepared WSL export for ${plan.distributionName}.`],
  };
  if (!options.confirmExport) {
    throw new Error("wsl-export writes a backup archive. Re-run with --confirm-export to proceed.");
  }
  if (isUnderSystemTempOutsideRoot(backupArchive, plan.root)) {
    throw new Error(`Refusing to write WSL export archive under system temp: ${backupArchive}`);
  }
  const executablePath = resolveWslExecutable();
  if (!executablePath) {
    throw new Error("wsl.exe not found. Install or enable WSL2 before exporting a distribution.");
  }
  const diagnostics = wslDiagnostics(plan.root);
  const registered = diagnostics.distros.some((item) => item.name.toLowerCase() === plan.distributionName.toLowerCase());
  if (diagnostics.listSucceeded && !registered) {
    throw new Error(`WSL distribution is not registered: ${plan.distributionName}`);
  }
  mkdirSync(dirname(backupArchive), { recursive: true });
  const invocation = wslExecutableInvocation(executablePath, args);
  const stdout = execFileSync(invocation.executablePath, invocation.args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  return {
    ...result,
    executablePath,
    executed: true,
    stdout: stdout.trim(),
    messages: [`Exported WSL distribution ${plan.distributionName} to ${backupArchive}.`],
  };
}

function checksumStatus(sourceArchive: string, checksumFile: string) {
  if (!existsSync(checksumFile)) {
    return {
      path: checksumFile,
      exists: false,
      expected: null,
      actual: null,
      verified: false,
    };
  }
  const expected = parseExpectedSha256(readFileSync(checksumFile, "utf8"));
  const actual = existsSync(sourceArchive) ? sha256File(sourceArchive) : null;
  return {
    path: checksumFile,
    exists: true,
    expected,
    actual,
    verified: expected !== null && actual !== null && expected.toLowerCase() === actual.toLowerCase(),
  };
}

function parseExpectedSha256(value: string): string | null {
  const match = value.match(/[A-Fa-f0-9]{64}/);
  return match ? match[0].toLowerCase() : null;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeDistro(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function safeDistributionSuffix(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "Ubuntu";
}

function quoteCommandArg(value: string): string {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function quotePowerShellArg(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function defaultBackupArchive(root: string, distributionName: string): string {
  return join(root, "data", "backups", "wsl", `${distributionName}-${timestampForFile()}.tar`);
}

function timestampForFile(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isUnderSystemTempOutsideRoot(path: string, root: string): boolean {
  const temp = resolve(tmpdir()).toLowerCase();
  const target = resolve(path).toLowerCase();
  const projectRoot = resolve(root).toLowerCase();
  const underRoot = target === projectRoot || target.startsWith(`${projectRoot}\\`) || target.startsWith(`${projectRoot}/`);
  const underTemp = target === temp || target.startsWith(`${temp}\\`) || target.startsWith(`${temp}/`);
  return underTemp && !underRoot;
}
