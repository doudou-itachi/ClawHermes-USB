import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AdapterDescriptor, EnvFileDiagnostic, EnvInitResult, ServiceEnvironment, ServiceEnvironmentDiagnostic, ServiceEnvFileResult } from "./types";
import { loadAdapters } from "./adapters";
import { getRoot, portableEnv, resolveRelative } from "./portable";

export function envFileDiagnostics(usbRoot: string, adapters: AdapterDescriptor[]): EnvFileDiagnostic[] {
  const root = getRoot(usbRoot);
  const diagnostics: EnvFileDiagnostic[] = [];
  const seen = new Set<string>();
  for (const adapter of adapters) {
    for (const envFile of adapter.env?.files ?? []) {
      const key = `${adapter.id}:${envFile}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const examplePath = `${envFile}.example`;
      diagnostics.push({
        serviceId: adapter.id,
        path: envFile,
        exists: existsSync(resolveRelative(root, envFile)),
        examplePath,
        exampleExists: existsSync(resolveRelative(root, examplePath)),
      });
    }
  }
  return diagnostics.sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.path.localeCompare(b.path));
}

export function initializeEnvFiles(usbRoot: string, dryRun: boolean): EnvInitResult {
  const root = getRoot(usbRoot);
  const diagnostics = envFileDiagnostics(root, loadAdapters(root));
  const result: EnvInitResult = {
    root,
    dryRun,
    files: [],
    created: [],
    skipped: [],
    messages: [],
  };

  for (const envFile of diagnostics) {
    if (envFile.exists) {
      result.files.push({ ...envFile, action: "skipped", reason: "exists" });
      result.skipped.push({
        serviceId: envFile.serviceId,
        path: envFile.path,
        examplePath: envFile.examplePath,
        reason: "exists",
      });
      result.messages.push(`Skipped existing env file: ${envFile.path}.`);
      continue;
    }

    if (!envFile.exampleExists) {
      result.files.push({ ...envFile, action: "skipped", reason: "missing-example" });
      result.skipped.push({
        serviceId: envFile.serviceId,
        path: envFile.path,
        examplePath: envFile.examplePath,
        reason: "missing-example",
      });
      result.messages.push(`Cannot create ${envFile.path}; template is missing: ${envFile.examplePath}.`);
      continue;
    }

    result.created.push(envFile.path);
    if (dryRun) {
      result.files.push({ ...envFile, action: "would-create", reason: null });
      result.messages.push(`Would create ${envFile.path} from ${envFile.examplePath}.`);
      continue;
    }

    const target = resolveRelative(root, envFile.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(resolveRelative(root, envFile.examplePath), target);
    result.files.push({ ...envFile, action: "created", reason: null });
    result.messages.push(`Created ${envFile.path} from ${envFile.examplePath}.`);
  }

  return result;
}

export function resolveServiceEnvironment(usbRoot: string, serviceId: string): ServiceEnvironment {
  const root = getRoot(usbRoot);
  const adapter = loadAdapters(root).find((item) => item.id === serviceId);
  if (!adapter) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  const env: Record<string, string> = { ...portableEnv(root) };
  const files: ServiceEnvFileResult[] = [];
  const messages: string[] = [];

  for (const envPath of adapter.env?.files ?? []) {
    const absolutePath = resolveRelative(root, envPath);
    if (!existsSync(absolutePath)) {
      files.push({ path: envPath, exists: false, loaded: false, variables: [], errors: [] });
      messages.push(`Env file missing: ${envPath}.`);
      continue;
    }

    const parsed = parseEnvFile(absolutePath);
    Object.assign(env, parsed.variables);
    files.push({
      path: envPath,
      exists: true,
      loaded: parsed.errors.length === 0,
      variables: Object.keys(parsed.variables).sort(),
      errors: parsed.errors,
    });
    if (parsed.errors.length === 0) {
      messages.push(`Loaded env file: ${envPath}.`);
    } else {
      messages.push(`Loaded env file with ${parsed.errors.length} parse issue(s): ${envPath}.`);
    }
  }

  for (const [name, value] of Object.entries(adapter.env?.variables ?? {})) {
    env[name] = expandEnvTemplate(value, env);
  }

  return { root, serviceId: adapter.id, env, files, messages };
}

export function serviceEnvironmentDiagnostic(usbRoot: string, serviceId: string): ServiceEnvironmentDiagnostic {
  const resolved = resolveServiceEnvironment(usbRoot, serviceId);
  return {
    root: resolved.root,
    serviceId: resolved.serviceId,
    files: resolved.files,
    variables: Object.keys(resolved.env).sort(),
    messages: resolved.messages,
  };
}

function parseEnvFile(file: string): { variables: Record<string, string>; errors: string[] } {
  const variables: Record<string, string> = {};
  const errors: string[] = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) {
      errors.push(`Line ${index + 1}: expected KEY=value.`);
      continue;
    }
    variables[match[1]] = unquoteEnvValue(match[2].trim());
  }
  return { variables, errors };
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function expandEnvTemplate(value: string, env: Record<string, string>): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name: string) => env[name] ?? match);
}
