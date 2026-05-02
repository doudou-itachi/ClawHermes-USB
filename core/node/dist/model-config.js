"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureSharedModel = configureSharedModel;
exports.sharedModelConfigStatus = sharedModelConfigStatus;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
function configureSharedModel(usbRoot, input) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const config = validateModelConfig(input);
    const settingsPath = (0, portable_1.resolveRelative)(root, "data/settings/model-config.json");
    const applied = [];
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(settingsPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(settingsPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
        messages: [
            ...applied.map((target) => `Configured ${target} model settings.`),
            ...(applied.length > 0 ? ["Restart the affected services for model settings to take effect."] : []),
        ],
    };
}
function sharedModelConfigStatus(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const configPath = (0, portable_1.resolveRelative)(root, "data/settings/model-config.json");
    if (!(0, node_fs_1.existsSync)(configPath)) {
        return {
            root,
            configPath,
            exists: false,
            config: null,
        };
    }
    const config = JSON.parse((0, node_fs_1.readFileSync)(configPath, "utf8"));
    return {
        root,
        configPath,
        exists: true,
        config: redactModelConfig(config),
    };
}
function validateModelConfig(input) {
    const providerType = requireTrimmed(input.providerType, "provider type is required");
    if (providerType !== "openai-compatible") {
        throw new Error("provider type must be openai-compatible");
    }
    const apiUrl = requireTrimmed(input.apiUrl, "API URL is required");
    validateApiUrl(apiUrl);
    const model = requireTrimmed(input.model, "model name is required");
    const apiKey = requireTrimmed(input.apiKey, "API key is required");
    const apply = (input.apply?.trim() || "both");
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
function requireTrimmed(value, message) {
    const trimmed = value?.trim();
    if (!trimmed)
        throw new Error(message);
    return trimmed;
}
function validateApiUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            throw new Error("invalid protocol");
        }
    }
    catch {
        throw new Error("API URL must be a valid http or https URL");
    }
}
function redactModelConfig(config) {
    return {
        providerType: config.providerType,
        apiUrl: config.apiUrl,
        model: config.model,
        apiKey: "[redacted]",
        apply: config.apply,
    };
}
function applyOpenClawModelConfig(root, config) {
    const configPath = (0, portable_1.resolveRelative)(root, "data/openclaw/openclaw.json");
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
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(configPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(configPath, `${JSON.stringify(openclaw, null, 2)}\n`, "utf8");
    writeOpenClawAuthProfile(root, config);
}
function applyHermesModelConfig(root, config) {
    const hermesDir = (0, portable_1.resolveRelative)(root, "data/hermes");
    (0, node_fs_1.mkdirSync)(hermesDir, { recursive: true });
    const configPath = (0, portable_1.resolveRelative)(root, "data/hermes/config.yaml");
    const existingConfig = (0, node_fs_1.existsSync)(configPath) ? (0, node_fs_1.readFileSync)(configPath, "utf8") : "";
    (0, node_fs_1.writeFileSync)(configPath, buildHermesWebUiConfig(existingConfig, config), "utf8");
    const envPath = (0, portable_1.resolveRelative)(root, "data/hermes/.env");
    const existingEnv = (0, node_fs_1.existsSync)(envPath) ? (0, node_fs_1.readFileSync)(envPath, "utf8") : "";
    const nextEnv = upsertEnvValue(upsertEnvValue(existingEnv, "OPENAI_API_KEY", config.apiKey), "OPENAI_BASE_URL", config.apiUrl);
    (0, node_fs_1.writeFileSync)(envPath, nextEnv, "utf8");
}
function readJsonFile(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return {};
    const text = (0, node_fs_1.readFileSync)(path, "utf8").trim();
    if (!text)
        return {};
    return JSON.parse(text);
}
function writeOpenClawAuthProfile(root, config) {
    const authPath = (0, portable_1.resolveRelative)(root, "data/openclaw/agents/main/agent/auth-profiles.json");
    const store = objectValue(readJsonFile(authPath));
    store.version = 1;
    const profiles = ensureObjectProperty(store, "profiles");
    profiles["clawhermes:default"] = {
        type: "api_key",
        provider: "clawhermes",
        key: config.apiKey,
    };
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(authPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(authPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}
function objectValue(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function ensureObjectProperty(target, key) {
    const current = target[key];
    if (!current || typeof current !== "object" || Array.isArray(current)) {
        target[key] = {};
    }
    return target[key];
}
function hermesModelBlock(config) {
    const providerName = hermesCustomProviderName(config.apiUrl);
    return [
        "# ClawHermes-managed model configuration",
        "model:",
        `  provider: custom:${yamlScalar(providerName)}`,
        `  default: ${yamlScalar(config.model)}`,
        "custom_providers:",
        `  - name: ${yamlScalar(providerName)}`,
        `    base_url: ${yamlScalar(config.apiUrl)}`,
        `    api_key: ${yamlScalar(config.apiKey)}`,
        `    model: ${yamlScalar(config.model)}`,
        "# End ClawHermes-managed model configuration",
    ].join("\n");
}
function buildHermesWebUiConfig(existing, config) {
    const normalized = normalizeExistingYamlConfig(existing);
    const withoutManagedBlock = removeManagedYamlBlock(normalized);
    const preserved = stripTopLevelYamlSections(withoutManagedBlock, new Set(["model", "providers", "custom_providers"])).trim();
    const block = hermesModelBlock(config);
    return preserved ? `${block}\n\n${preserved}\n` : `${block}\n`;
}
function normalizeExistingYamlConfig(existing) {
    const trimmed = existing.trim();
    if (!trimmed || trimmed === "{}") {
        return "";
    }
    return existing.replace(/^\s*\{\}\s*(?=# ClawHermes-managed model configuration|$)/, "");
}
function removeManagedYamlBlock(existing) {
    const start = "# ClawHermes-managed model configuration";
    const end = "# End ClawHermes-managed model configuration";
    const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\r?\\n?`);
    return existing.replace(pattern, "");
}
function stripTopLevelYamlSections(existing, keys) {
    const lines = existing.split(/\r?\n/);
    const kept = [];
    let skipping = false;
    for (const line of lines) {
        const key = topLevelYamlKey(line);
        if (key) {
            skipping = keys.has(key);
        }
        if (!skipping) {
            kept.push(line);
        }
    }
    return kept.join("\n").replace(/\n{3,}/g, "\n\n");
}
function topLevelYamlKey(line) {
    if (!line || /^\s/.test(line) || line.trimStart().startsWith("#"))
        return null;
    const match = /^([A-Za-z0-9_-]+):(?:\s|$)/.exec(line);
    return match?.[1] ?? null;
}
function upsertManagedYamlBlock(existing, block) {
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
function upsertEnvValue(existing, key, value) {
    const lines = existing.split(/\r?\n/).filter((line) => line.length > 0 && !line.startsWith(`${key}=`));
    lines.push(`${key}=${value}`);
    return `${lines.join("\n")}\n`;
}
function yamlScalar(value) {
    return /^[A-Za-z0-9._:/-]+$/.test(value) ? value : JSON.stringify(value);
}
function hermesCustomProviderName(apiUrl) {
    try {
        const hostname = new URL(apiUrl).hostname.trim().toLowerCase();
        return hostname ? hostname.replace(/\s+/g, "-") : "clawhermes";
    }
    catch {
        return "clawhermes";
    }
}
function ensureTrailingNewline(value) {
    return value.endsWith("\n") ? value : `${value}\n`;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
