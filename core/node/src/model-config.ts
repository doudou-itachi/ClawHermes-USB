import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getRoot, resolveRelative } from "./portable";

export type ModelProviderType = "openai-compatible";
export type ModelApplyTarget = "openclaw" | "hermes" | "both";

export type ModelConfigInput = {
  providerType?: string;
  apiUrl?: string;
  model?: string;
  apiKey?: string;
  apply?: string;
};

export type SavedModelConfig = {
  providerType: ModelProviderType;
  apiUrl: string;
  model: string;
  apiKey: string;
  apply: ModelApplyTarget;
};

export type RedactedModelConfig = Omit<SavedModelConfig, "apiKey"> & {
  apiKey: "[redacted]";
};

export function configureSharedModel(usbRoot: string, input: ModelConfigInput) {
  const root = getRoot(usbRoot);
  const config = validateModelConfig(input);
  const settingsPath = resolveRelative(root, "data/settings/model-config.json");
  const applied: string[] = [];

  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  if (config.apply === "openclaw" || config.apply === "both") {
    applyOpenClawModelConfig(root, config);
    applied.push("openclaw");
  }
  if (config.apply === "hermes" || config.apply === "both") {
    applyHermesModelConfig(root, config);
    applied.push("hermes");
  }

  return {
    root,
    configPath: settingsPath,
    apply: config.apply,
    applied,
    config: redactModelConfig(config),
    messages: applied.map((target) => `Configured ${target} model settings.`),
  };
}

export function sharedModelConfigStatus(usbRoot: string) {
  const root = getRoot(usbRoot);
  const configPath = resolveRelative(root, "data/settings/model-config.json");
  if (!existsSync(configPath)) {
    return {
      root,
      configPath,
      exists: false,
      config: null,
    };
  }
  const config = JSON.parse(readFileSync(configPath, "utf8")) as SavedModelConfig;
  return {
    root,
    configPath,
    exists: true,
    config: redactModelConfig(config),
  };
}

function validateModelConfig(input: ModelConfigInput): SavedModelConfig {
  const providerType = requireTrimmed(input.providerType, "provider type is required");
  if (providerType !== "openai-compatible") {
    throw new Error("provider type must be openai-compatible");
  }

  const apiUrl = requireTrimmed(input.apiUrl, "API URL is required");
  validateApiUrl(apiUrl);

  const model = requireTrimmed(input.model, "model name is required");
  const apiKey = requireTrimmed(input.apiKey, "API key is required");
  const apply = (input.apply?.trim() || "both") as ModelApplyTarget;
  if (apply !== "openclaw" && apply !== "hermes" && apply !== "both") {
    throw new Error("apply target must be openclaw, hermes, or both");
  }

  return {
    providerType,
    apiUrl,
    model,
    apiKey,
    apply,
  };
}

function requireTrimmed(value: string | undefined, message: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function validateApiUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new Error("API URL must be a valid http or https URL");
  }
}

function redactModelConfig(config: SavedModelConfig): RedactedModelConfig {
  return {
    providerType: config.providerType,
    apiUrl: config.apiUrl,
    model: config.model,
    apiKey: "[redacted]",
    apply: config.apply,
  };
}

function applyOpenClawModelConfig(root: string, config: SavedModelConfig): void {
  const configPath = resolveRelative(root, "data/openclaw/openclaw.json");
  const openclaw = objectValue(readJsonFile(configPath));
  const modelRef = `clawhermes/${config.model}`;
  const models = ensureObjectProperty(openclaw, "models");
  const providers = ensureObjectProperty(models, "providers");
  providers.clawhermes = {
    api: "openai-completions",
    baseUrl: config.apiUrl,
    apiKey: config.apiKey,
    models: [
      {
        id: config.model,
        name: config.model,
        input: ["text"],
      },
    ],
  };

  const agents = ensureObjectProperty(openclaw, "agents");
  const defaults = ensureObjectProperty(agents, "defaults");
  defaults.model = { primary: modelRef };
  const defaultModels = ensureObjectProperty(defaults, "models");
  defaultModels[modelRef] = {};

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(openclaw, null, 2)}\n`, "utf8");
  writeOpenClawAuthProfile(root, config);
}

function applyHermesModelConfig(root: string, config: SavedModelConfig): void {
  const hermesDir = resolveRelative(root, "data/hermes");
  mkdirSync(hermesDir, { recursive: true });

  const configPath = resolveRelative(root, "data/hermes/config.yaml");
  const existingConfig = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  writeFileSync(configPath, upsertManagedYamlBlock(existingConfig, hermesModelBlock(config)), "utf8");

  const envPath = resolveRelative(root, "data/hermes/.env");
  const existingEnv = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  writeFileSync(envPath, upsertEnvValue(existingEnv, "OPENAI_API_KEY", config.apiKey), "utf8");
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8").trim();
  if (!text) return {};
  return JSON.parse(text);
}

function writeOpenClawAuthProfile(root: string, config: SavedModelConfig): void {
  const authPath = resolveRelative(root, "data/openclaw/agents/main/agent/auth-profiles.json");
  const store = objectValue(readJsonFile(authPath));
  store.version = 1;
  const profiles = ensureObjectProperty(store, "profiles");
  profiles["clawhermes:default"] = {
    type: "api_key",
    provider: "clawhermes",
    key: config.apiKey,
  };

  mkdirSync(dirname(authPath), { recursive: true });
  writeFileSync(authPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function ensureObjectProperty(target: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = target[key];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    target[key] = {};
  }
  return target[key] as Record<string, unknown>;
}

function hermesModelBlock(config: SavedModelConfig): string {
  return [
    "# ClawHermes-managed model configuration",
    "model:",
    "  provider: openai",
    `  model: ${yamlScalar(config.model)}`,
    `  base_url: ${yamlScalar(config.apiUrl)}`,
    "# End ClawHermes-managed model configuration",
  ].join("\n");
}

function upsertManagedYamlBlock(existing: string, block: string): string {
  const start = "# ClawHermes-managed model configuration";
  const end = "# End ClawHermes-managed model configuration";
  const normalizedBlock = `${block}\n`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\r?\\n?`);
  if (pattern.test(existing)) {
    return ensureTrailingNewline(existing.replace(pattern, normalizedBlock));
  }
  const prefix = existing.trimEnd();
  return prefix ? `${prefix}\n\n${normalizedBlock}` : normalizedBlock;
}

function upsertEnvValue(existing: string, key: string, value: string): string {
  const lines = existing.split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  return `${lines.join("\n")}\n`;
}

function yamlScalar(value: string): string {
  return /^[A-Za-z0-9._:/-]+$/.test(value) ? value : JSON.stringify(value);
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
