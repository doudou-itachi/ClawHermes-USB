import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getRoot } from "./portable";
import { resolveWslExecutable, wslExecutableInvocation } from "./wsl";

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
  return {
    root,
    distro,
    distributionName,
    installLocation,
    sourceArchive,
    sourceArchiveExists: existsSync(sourceArchive),
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
  const executablePath = resolveWslExecutable();
  if (!executablePath) {
    throw new Error("wsl.exe not found. Install or enable WSL2 before importing a distribution.");
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
