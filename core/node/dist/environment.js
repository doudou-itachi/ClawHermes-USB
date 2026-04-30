"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.envFileDiagnostics = envFileDiagnostics;
exports.initializeEnvFiles = initializeEnvFiles;
exports.resolveServiceEnvironment = resolveServiceEnvironment;
exports.serviceEnvironmentDiagnostic = serviceEnvironmentDiagnostic;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const portable_1 = require("./portable");
function envFileDiagnostics(usbRoot, adapters) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const diagnostics = [];
    const seen = new Set();
    for (const adapter of adapters) {
        for (const envFile of adapter.env?.files ?? []) {
            const key = `${adapter.id}:${envFile}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const examplePath = `${envFile}.example`;
            diagnostics.push({
                serviceId: adapter.id,
                path: envFile,
                exists: (0, node_fs_1.existsSync)((0, portable_1.resolveRelative)(root, envFile)),
                examplePath,
                exampleExists: (0, node_fs_1.existsSync)((0, portable_1.resolveRelative)(root, examplePath)),
            });
        }
    }
    return diagnostics.sort((a, b) => a.serviceId.localeCompare(b.serviceId) || a.path.localeCompare(b.path));
}
function initializeEnvFiles(usbRoot, dryRun) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const diagnostics = envFileDiagnostics(root, (0, adapters_1.loadAdapters)(root));
    const result = {
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
        const target = (0, portable_1.resolveRelative)(root, envFile.path);
        (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(target), { recursive: true });
        (0, node_fs_1.copyFileSync)((0, portable_1.resolveRelative)(root, envFile.examplePath), target);
        result.files.push({ ...envFile, action: "created", reason: null });
        result.messages.push(`Created ${envFile.path} from ${envFile.examplePath}.`);
    }
    return result;
}
function resolveServiceEnvironment(usbRoot, serviceId) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const adapter = (0, adapters_1.loadAdapters)(root).find((item) => item.id === serviceId);
    if (!adapter) {
        throw new Error(`Unknown service: ${serviceId}`);
    }
    const env = { ...(0, portable_1.portableEnv)(root) };
    const files = [];
    const messages = [];
    for (const envPath of adapter.env?.files ?? []) {
        const absolutePath = (0, portable_1.resolveRelative)(root, envPath);
        if (!(0, node_fs_1.existsSync)(absolutePath)) {
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
        }
        else {
            messages.push(`Loaded env file with ${parsed.errors.length} parse issue(s): ${envPath}.`);
        }
    }
    for (const [name, value] of Object.entries(adapter.env?.variables ?? {})) {
        env[name] = expandEnvTemplate(value, env);
    }
    return { root, serviceId: adapter.id, env, files, messages };
}
function serviceEnvironmentDiagnostic(usbRoot, serviceId) {
    const resolved = resolveServiceEnvironment(usbRoot, serviceId);
    return {
        root: resolved.root,
        serviceId: resolved.serviceId,
        files: resolved.files,
        variables: Object.keys(resolved.env).sort(),
        messages: resolved.messages,
    };
}
function parseEnvFile(file) {
    const variables = {};
    const errors = [];
    const lines = (0, node_fs_1.readFileSync)(file, "utf8").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const rawLine = lines[index];
        const line = rawLine.trim();
        if (!line || line.startsWith("#"))
            continue;
        const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!match) {
            errors.push(`Line ${index + 1}: expected KEY=value.`);
            continue;
        }
        variables[match[1]] = unquoteEnvValue(match[2].trim());
    }
    return { variables, errors };
}
function unquoteEnvValue(value) {
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}
function expandEnvTemplate(value, env) {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name) => env[name] ?? match);
}
