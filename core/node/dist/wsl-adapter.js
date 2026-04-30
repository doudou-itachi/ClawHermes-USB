"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wslAdapterSetupPlan = wslAdapterSetupPlan;
exports.assertWslReadyForAdapter = assertWslReadyForAdapter;
const portable_1 = require("./portable");
const wsl_1 = require("./wsl");
function wslAdapterSetupPlan(root, adapter, serviceEnv) {
    const diagnostics = (0, wsl_1.wslDiagnostics)(root);
    const workingDirectory = windowsPathToWslPath((0, portable_1.resolveRelative)(root, adapter.appDir));
    const command = adapter.commands.setup;
    if (!command)
        throw new Error(`Adapter ${adapter.id} does not declare a setup command.`);
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
function assertWslReadyForAdapter(root, serviceId) {
    const diagnostics = (0, wsl_1.wslDiagnostics)(root);
    if (!diagnostics.found || !diagnostics.hasWsl2Distro) {
        throw new Error(`WSL2 is not ready for ${serviceId}: ${diagnostics.messages.join(" ")}`);
    }
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
