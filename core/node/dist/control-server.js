"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startControlServer = startControlServer;
exports.stopControlServer = stopControlServer;
const node_child_process_1 = require("node:child_process");
const node_http_1 = require("node:http");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_url_1 = require("node:url");
const model_config_1 = require("./model-config");
const diagnostics_1 = require("./diagnostics");
const core_1 = require("./core");
const lifecycle_1 = require("./lifecycle");
const portable_1 = require("./portable");
const status_1 = require("./status");
const diagnostics_2 = require("./diagnostics");
function startControlServer(usbRoot, options) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const existing = readControlServerMetadata(root);
    if (existing && (0, status_1.processExists)(existing.processId))
        return existing;
    const metadataPath = controlServerMetadataPath(root);
    (0, node_fs_1.rmSync)(metadataPath, { force: true });
    const script = (0, node_path_1.join)(root, "core", "node", "dist", "control-server.js");
    const logFile = (0, node_path_1.join)(root, "data", "logs", "control-server.log");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
    const child = (0, node_child_process_1.spawn)(process.execPath, [script, "--usb-root", root, "--port", String(options.port)], {
        cwd: root,
        env: process.env,
        detached: true,
        shell: false,
        stdio: "ignore",
        windowsHide: true,
    });
    child.unref();
    const metadata = waitForControlServerMetadata(root);
    return metadata;
}
function stopControlServer(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const metadata = readControlServerMetadata(root);
    if (!metadata)
        return { root, stopped: false };
    try {
        (0, lifecycle_1.killProcessTree)(metadata.processId);
    }
    catch {
        // Already stopped.
    }
    removeControlServerMetadata(root);
    return { root, stopped: true };
}
function waitForControlServerMetadata(root) {
    const deadline = Date.now() + 5000;
    let lastError = null;
    while (Date.now() < deadline) {
        try {
            const metadata = readControlServerMetadata(root);
            if (metadata)
                return metadata;
        }
        catch (error) {
            lastError = error;
        }
        sleep(100);
    }
    throw new Error(`Control server did not publish metadata.${lastError instanceof Error ? ` ${lastError.message}` : ""}`);
}
function sleep(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function controlServerMetadataPath(root) {
    return (0, node_path_1.join)(root, "data", "tmp", "control-server.json");
}
function controlServerPidPath(root) {
    return (0, node_path_1.join)(root, "data", "tmp", "pids", "control-server.pid");
}
function readControlServerMetadata(root) {
    const path = controlServerMetadataPath(root);
    if (!(0, node_fs_1.existsSync)(path))
        return null;
    return JSON.parse((0, node_fs_1.readFileSync)(path, "utf8"));
}
function writeControlServerMetadata(root, metadata) {
    const metadataPath = controlServerMetadataPath(root);
    const pidPath = controlServerPidPath(root);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(metadataPath), { recursive: true });
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pidPath), { recursive: true });
    (0, node_fs_1.writeFileSync)(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    (0, node_fs_1.writeFileSync)(pidPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}
function removeControlServerMetadata(root) {
    (0, node_fs_1.rmSync)(controlServerMetadataPath(root), { force: true });
    (0, node_fs_1.rmSync)(controlServerPidPath(root), { force: true });
}
function parseArgs(argv) {
    let usbRoot = process.cwd();
    let port = 17100;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--usb-root" && argv[index + 1]) {
            usbRoot = argv[index + 1];
            index += 1;
        }
        else if (arg === "--port" && argv[index + 1]) {
            port = Number(argv[index + 1]);
            index += 1;
        }
    }
    return { usbRoot: (0, node_path_1.resolve)(usbRoot), port };
}
if (process.argv[1]?.endsWith("control-server.js")) {
    runControlServer(parseArgs(process.argv.slice(2)));
}
function runControlServer(options) {
    const root = (0, portable_1.getRoot)(options.usbRoot);
    const logFile = (0, node_path_1.join)(root, "data", "logs", "control-server.log");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
    const server = (0, node_http_1.createServer)(async (request, response) => {
        try {
            await routeRequest(root, request, response);
        }
        catch (error) {
            sendJson(response, 500, {
                error: {
                    code: "operation_failed",
                    message: error instanceof Error ? error.message : String(error),
                },
            });
        }
    });
    server.listen(options.port, "127.0.0.1", () => {
        const address = server.address();
        const assignedPort = typeof address === "object" && address ? address.port : options.port;
        const metadata = {
            serviceId: "control-server",
            displayName: "Control Server",
            status: "running",
            processId: process.pid,
            startedAt: new Date().toISOString(),
            url: `http://127.0.0.1:${assignedPort}/`,
            root,
            logFile,
        };
        writeControlServerMetadata(root, metadata);
    });
    const shutdown = () => {
        removeControlServerMetadata(root);
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 1000).unref();
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
}
async function routeRequest(root, request, response) {
    const requestUrl = new node_url_1.URL(request.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, {
            serviceId: "control-server",
            status: "running",
            root,
            generatedAt: new Date().toISOString(),
        });
        return;
    }
    if (request.method === "GET" && pathname === "/api/status") {
        sendJson(response, 200, (0, core_1.getStatus)(root));
        return;
    }
    if (request.method === "GET" && pathname === "/api/install/status") {
        sendJson(response, 200, (0, diagnostics_2.setupDiagnostics)(root));
        return;
    }
    if (request.method === "GET" && pathname === "/api/model-config") {
        const status = (0, model_config_1.sharedModelConfigStatus)(root);
        sendJson(response, 200, { ...status, configured: status.exists });
        return;
    }
    if (request.method === "POST" && pathname === "/api/model-config") {
        const body = await readJsonBody(request);
        sendJson(response, 200, (0, model_config_1.configureSharedModel)(root, {
            providerType: stringBodyValue(body.providerType),
            apiUrl: stringBodyValue(body.apiUrl),
            model: stringBodyValue(body.model),
            apiKey: stringBodyValue(body.apiKey),
            apply: stringBodyValue(body.apply),
        }));
        return;
    }
    if (request.method === "GET" && pathname === "/api/logs") {
        const service = requestUrl.searchParams.get("service") || "launcher";
        const lines = Number(requestUrl.searchParams.get("lines") || "80");
        sendJson(response, 200, (0, diagnostics_1.readLogTail)(root, service, Number.isFinite(lines) ? lines : 80));
        return;
    }
    if (request.method === "POST" && pathname === "/api/services/start") {
        sendJson(response, 200, await (0, core_1.startSkeleton)(root, { attachManagedToParent: true }));
        return;
    }
    if (request.method === "POST" && pathname === "/api/services/stop") {
        sendJson(response, 200, (0, core_1.stopSkeleton)(root));
        return;
    }
    const serviceMatch = /^\/api\/services\/([^/]+)\/(start|stop)$/.exec(pathname);
    if (request.method === "POST" && serviceMatch) {
        const serviceId = decodeURIComponent(serviceMatch[1]);
        const action = serviceMatch[2];
        if (action === "start") {
            sendJson(response, 200, (0, core_1.startSingleAdapter)(root, serviceId, { dryRun: false, confirm: true, attachManagedToParent: true }));
            return;
        }
        sendJson(response, 200, (0, core_1.stopSingleAdapter)(root, serviceId));
        return;
    }
    if (request.method === "POST" && pathname === "/api/shutdown") {
        sendJson(response, 200, { status: "stopping" });
        setTimeout(() => {
            removeControlServerMetadata(root);
            process.kill(process.pid, "SIGTERM");
        }, 20).unref();
        return;
    }
    sendJson(response, 404, {
        error: {
            code: "not_found",
            message: `No control API route for ${request.method ?? "GET"} ${pathname}.`,
        },
    });
}
async function readJsonBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length === 0)
        return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function stringBodyValue(value) {
    return typeof value === "string" ? value : undefined;
}
function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
    });
    response.end(JSON.stringify(payload, null, 2));
}
