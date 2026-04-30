import type { AdapterDescriptor, ServiceEnvironment } from "./types";
import { resolveRelative } from "./portable";
import { wslDiagnostics } from "./wsl";

export function wslAdapterSetupPlan(root: string, adapter: AdapterDescriptor, serviceEnv: ServiceEnvironment) {
  const diagnostics = wslDiagnostics(root);
  const workingDirectory = windowsPathToWslPath(resolveRelative(root, adapter.appDir));
  const command = adapter.commands.setup;
  if (!command) throw new Error(`Adapter ${adapter.id} does not declare a setup command.`);
  const script = [
    ...environmentExports(root, serviceEnv.env),
    command,
  ].join(" && ");
  return {
    executablePath: diagnostics.executablePath ?? "wsl.exe",
    workingDirectory,
    args: ["--cd", workingDirectory, "--", "bash", "-lc", script],
    script,
    diagnostics,
  };
}

export function assertWslReadyForAdapter(root: string, serviceId: string): void {
  const diagnostics = wslDiagnostics(root);
  if (!diagnostics.found || !diagnostics.hasWsl2Distro) {
    throw new Error(`WSL2 is not ready for ${serviceId}: ${diagnostics.messages.join(" ")}`);
  }
}

function environmentExports(root: string, env: Record<string, string>): string[] {
  return Object.entries(env)
    .filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    .filter(([name]) => !["PATH", "PATHEXT", "COMSPEC", "PSMODULEPATH"].includes(name.toUpperCase()))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `export ${name}=${shellQuote(convertEnvValue(root, value))}`);
}

function convertEnvValue(root: string, value: string): string {
  if (isWindowsAbsolutePath(value)) return windowsPathToWslPath(value);
  const normalizedRoot = root.toLowerCase();
  if (value.toLowerCase().startsWith(normalizedRoot)) return windowsPathToWslPath(value);
  return value;
}

function windowsPathToWslPath(path: string): string {
  const match = path.match(/^([A-Za-z]):[\\/]*(.*)$/);
  if (!match) throw new Error(`Cannot convert Windows path to WSL path: ${path}`);
  const drive = match[1].toLowerCase();
  const rest = match[2].replaceAll("\\", "/").replace(/^\/+/, "");
  return `/mnt/${drive}/${rest}`;
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
