"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslAdapterSetupPlan = wslAdapterSetupPlan;
exports.wslAdapterCommandPlan = wslAdapterCommandPlan;
exports.assertWslReadyForAdapter = assertWslReadyForAdapter;
exports.assertWslReadyForAdapterDistro = assertWslReadyForAdapterDistro;
const portable_1 = require("./portable");
const wsl_1 = require("./wsl");
const command_template_1 = require("./command-template");
function wslAdapterSetupPlan(root, adapter, serviceEnv) {
    return wslAdapterCommandPlan(root, adapter, serviceEnv, "setup");
}
function wslAdapterCommandPlan(root, adapter, serviceEnv, phase) {
    const distro = adapter.runtime?.distro;
    const diagnostics = (0, wsl_1.wslDiagnostics)(root, distro);
    const workingDirectory = windowsPathToWslPath((0, portable_1.resolveRelative)(root, adapter.appDir));
    const commandTemplate = adapter.commands[phase];
    if (!commandTemplate)
        throw new Error(`Adapter ${adapter.id} does not declare a ${phase} command.`);
    const command = (0, command_template_1.expandCommandTemplate)(commandTemplate, serviceEnv.env);
    const script = [
        ...environmentExports(root, serviceEnv.env),
        command,
    ].join(" && ");
    return {
        executablePath: diagnostics.executablePath ?? "wsl.exe",
        workingDirectory,
        args: [...distroArgs(distro), "--cd", workingDirectory, "--", "bash", "-lc", script],
        script,
        diagnostics,
    };
}
function assertWslReadyForAdapter(root, serviceId) {
    const diagnostics = (0, wsl_1.wslDiagnostics)(root);
    if (!diagnostics.found || !diagnostics.hasWsl2Distro) {
        throw new Error(`WSL2 is not ready for ${serviceId}: ${diagnostics.messages.join(" ")}`);
    }
}
function assertWslReadyForAdapterDistro(root, serviceId, distro) {
    const diagnostics = (0, wsl_1.wslDiagnostics)(root, distro);
    const distroReady = distro ? diagnostics.hasDesiredDistro && diagnostics.desiredDistroVersion === 2 : diagnostics.hasWsl2Distro;
    if (!diagnostics.found || !distroReady) {
        throw new Error(`WSL2 is not ready for ${serviceId}: ${diagnostics.messages.join(" ")}`);
    }
}
function distroArgs(distro) {
    const trimmed = distro?.trim();
    return trimmed ? ["--distribution", trimmed] : [];
}
function environmentExports(root, env) {
    return Object.entries(env)
        .filter(([name]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        .filter(([name]) => !["PATH", "PATHEXT", "COMSPEC", "PSMODULEPATH"].includes(name.toUpperCase()))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => `export ${name}=${shellQuote(convertEnvValue(root, value))}`);
}
function convertEnvValue(root, value) {
    if (isWindowsAbsolutePath(value))
        return windowsPathToWslPath(value);
    const normalizedRoot = root.toLowerCase();
    if (value.toLowerCase().startsWith(normalizedRoot))
        return windowsPathToWslPath(value);
    return value;
}
function windowsPathToWslPath(path) {
    const match = path.match(/^([A-Za-z]):[\\/]*(.*)$/);
    if (!match)
        throw new Error(`Cannot convert Windows path to WSL path: ${path}`);
    const drive = match[1].toLowerCase();
    const rest = match[2].replaceAll("\\", "/").replace(/^\/+/, "");
    return `/mnt/${drive}/${rest}`;
}
function isWindowsAbsolutePath(value) {
    return /^[A-Za-z]:[\\/]/.test(value);
}
function shellQuote(value) {
    return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
