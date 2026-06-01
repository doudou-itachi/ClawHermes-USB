"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimePortsPath = runtimePortsPath;
exports.readRuntimePortState = readRuntimePortState;
exports.assignRuntimePorts = assignRuntimePorts;
exports.applyRuntimePortsToAdapter = applyRuntimePortsToAdapter;
exports.applyRuntimePortsToEnvironment = applyRuntimePortsToEnvironment;
exports.replaceLocalhostPorts = replaceLocalhostPorts;
exports.runtimePortalUrl = runtimePortalUrl;
const node_net_1 = require("node:net");
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const portable_1 = require("./portable");
function runtimePortsPath(root) {
    return (0, node_path_1.join)((0, portable_1.getRoot)(root), "data", "tmp", "ports.json");
}
function readRuntimePortState(root) {
    const path = runtimePortsPath(root);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"));
    }
    catch {
        return null;
    }
}
async function assignRuntimePorts(rootInput, adapters) {
    const root = (0, portable_1.getRoot)(rootInput);
    const reserved = new Set();
    const portalDefaultPort = readDefaultPortalPort(root);
    const portalAssignedPort = await chooseAvailablePort(portalDefaultPort, reserved);
    reserved.add(portalAssignedPort);
    const services = [];
    for (const adapter of adapters) {
        const defaultPort = adapterDefaultPort(adapter);
        if (!defaultPort || services.some((item) => item.serviceId === adapter.id))
            continue;
        const assignedPort = await chooseAvailablePort(defaultPort, reserved);
        reserved.add(assignedPort);
        services.push({
            serviceId: adapter.id,
            host: "127.0.0.1",
            defaultPort,
            assignedPort,
            changed: assignedPort !== defaultPort,
        });
    }
    const state = {
        root,
        generatedAt: new Date().toISOString(),
        portal: {
            host: "127.0.0.1",
            defaultPort: portalDefaultPort,
            assignedPort: portalAssignedPort,
            changed: portalAssignedPort !== portalDefaultPort,
            url: `http://127.0.0.1:${portalAssignedPort}/`,
        },
        services,
    };
    const path = runtimePortsPath(root);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    (0, node_fs_1.writeFileSync)(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    return state;
}
function applyRuntimePortsToAdapter(adapter, state) {
    if (!state)
        return adapter;
    const cloned = structuredClone(adapter);
    if (typeof cloned.health?.url === "string")
        cloned.health.url = replaceLocalhostPorts(cloned.health.url, state);
    if (cloned.portal && typeof cloned.portal.url === "string")
        cloned.portal.url = replaceLocalhostPorts(cloned.portal.url, state);
    return cloned;
}
function applyRuntimePortsToEnvironment(serviceEnv, state) {
    if (!state)
        return serviceEnv;
    const env = { ...serviceEnv.env };
    const ownAssignment = state.services.find((item) => item.serviceId === serviceEnv.serviceId);
    for (const [name, value] of Object.entries(env)) {
        let nextValue = replaceLocalhostPorts(value, state);
        if (ownAssignment && isPortVariable(name) && value.trim() === String(ownAssignment.defaultPort)) {
            nextValue = String(ownAssignment.assignedPort);
        }
        env[name] = nextValue;
    }
    return { ...serviceEnv, env };
}
function replaceLocalhostPorts(value, state) {
    let result = value;
    for (const assignment of state.services) {
        result = replaceUrlPort(result, assignment.defaultPort, assignment.assignedPort);
    }
    result = replaceUrlPort(result, state.portal.defaultPort, state.portal.assignedPort);
    return result;
}
function runtimePortalUrl(root) {
    return readRuntimePortState(root)?.portal.url ?? "http://127.0.0.1:17000/";
}
function adapterDefaultPort(adapter) {
    const healthPort = portFromUrl(typeof adapter.health?.url === "string" ? adapter.health.url : null);
    if (healthPort)
        return healthPort;
    return portFromUrl(adapter.portal?.url ?? null);
}
function readDefaultPortalPort(root) {
    const portsPath = (0, portable_1.resolveRelative)(root, "config/defaults/ports.json");
    if (!(0, node_fs_1.existsSync)(portsPath))
        return 17000;
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(portsPath, "utf8"));
        return typeof parsed.portal === "number" && Number.isInteger(parsed.portal) ? parsed.portal : 17000;
    }
    catch {
        return 17000;
    }
}
function portFromUrl(value) {
    if (!value)
        return null;
    try {
        const parsed = new URL(value);
        if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost")
            return null;
        const port = Number(parsed.port);
        return Number.isInteger(port) && port > 0 ? port : null;
    }
    catch {
        return null;
    }
}
async function chooseAvailablePort(preferred, reserved) {
    let candidate = preferred;
    while (reserved.has(candidate) || !(await portAvailable(candidate)))
        candidate += 1;
    return candidate;
}
function portAvailable(port) {
    if (tcpPortListed(port))
        return Promise.resolve(false);
    return new Promise((resolveAvailable) => {
        const server = (0, node_net_1.createServer)();
        server.once("error", () => resolveAvailable(false));
        server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
    });
}
function tcpPortListed(port) {
    if (process.platform !== "win32")
        return false;
    try {
        const output = (0, node_child_process_1.execFileSync)("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", timeout: 3000, windowsHide: true });
        const pattern = new RegExp(`(?:^|\\s)(?:127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[?::1\\]?|\\[?::\\]?):${port}\\s+[^\\r\\n]*\\sLISTENING\\s`, "im");
        return pattern.test(output);
    }
    catch {
        return false;
    }
}
function replaceUrlPort(value, defaultPort, assignedPort) {
    if (defaultPort === assignedPort)
        return value;
    return value.replace(new RegExp(`(https?://(?:127\\.0\\.0\\.1|localhost):)${defaultPort}(?=/|$)`, "g"), `$1${assignedPort}`);
}
function isPortVariable(name) {
    return /(^|_)PORT$/i.test(name);
}
