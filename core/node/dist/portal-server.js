"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const adapters_1 = require("./adapters");
const adapter_verification_1 = require("./adapter-verification");
function parseArgs(argv) {
    let usbRoot = process.cwd();
    let port = 17000;
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
const { usbRoot, port } = parseArgs(process.argv.slice(2));
const portalFile = (0, node_path_1.join)(usbRoot, "portal", "index.html");
const statusFile = (0, node_path_1.join)(usbRoot, "data", "tmp", "status.json");
const setupFile = (0, node_path_1.join)(usbRoot, "data", "tmp", "setup.json");
const backupRoot = (0, node_path_1.join)(usbRoot, "data", "backups");
const logFile = (0, node_path_1.join)(usbRoot, "data", "logs", "portal.log");
(0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
function log(message) {
    (0, node_fs_1.appendFileSync)(logFile, `${new Date().toISOString()} [portal] [INFO] ${message}\n`);
}
const server = (0, node_http_1.createServer)((request, response) => {
    try {
        if (request.url === "/status.json") {
            if (!(0, node_fs_1.existsSync)(statusFile)) {
                response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "Status snapshot is not available" }));
                return;
            }
            response.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end((0, node_fs_1.readFileSync)(statusFile));
            return;
        }
        if (request.url === "/setup.json") {
            if (!(0, node_fs_1.existsSync)(setupFile)) {
                response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "Setup snapshot is not available" }));
                return;
            }
            response.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end((0, node_fs_1.readFileSync)(setupFile));
            return;
        }
        if (request.url === "/backups.json") {
            response.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end(JSON.stringify(backupSnapshot(), null, 2));
            return;
        }
        if (request.url === "/adapter-verification.json") {
            response.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            });
            response.end(JSON.stringify(adapterVerificationSnapshot(), null, 2));
            return;
        }
        if (request.url !== "/" && request.url !== "/index.html") {
            response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
            response.end("Not found");
            return;
        }
        if (!(0, node_fs_1.existsSync)(portalFile)) {
            response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
            response.end("Portal file is not available");
            return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end((0, node_fs_1.readFileSync)(portalFile));
    }
    catch (error) {
        log(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("Portal request failed");
    }
});
function backupSnapshot() {
    const backups = (0, node_fs_1.existsSync)(backupRoot)
        ? (0, node_fs_1.readdirSync)(backupRoot)
            .filter((fileName) => fileName.toLowerCase().endsWith(".zip"))
            .map((fileName) => {
            const path = (0, node_path_1.join)(backupRoot, fileName);
            const stats = (0, node_fs_1.statSync)(path);
            return {
                fileName,
                path,
                sizeBytes: stats.size,
                modifiedAt: stats.mtime.toISOString(),
            };
        })
            .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt))
        : [];
    return {
        root: usbRoot,
        backupRoot,
        count: backups.length,
        latest: backups[0] ?? null,
        backups,
    };
}
function adapterVerificationSnapshot() {
    const wslDiagnosticsByDistro = new Map();
    return {
        root: usbRoot,
        generatedAt: new Date().toISOString(),
        adapters: (0, adapters_1.loadAdapters)(usbRoot).map((adapter) => {
            const verification = (0, adapter_verification_1.verifyAdapter)(usbRoot, adapter.id, {
                wslDiagnosticsByDistro,
                wslCommandTimeoutMs: 1500,
                probeHealth: false,
            });
            return {
                serviceId: verification.serviceId,
                displayName: verification.displayName,
                productionReadyCandidate: verification.productionReadyCandidate,
                checks: verification.checks,
                nextSteps: verification.nextSteps,
                wsl: verification.wsl,
                health: verification.health,
            };
        }),
    };
}
server.listen(port, "127.0.0.1", () => {
    log(`Listening on http://127.0.0.1:${port}/`);
});
function shutdown() {
    server.close(() => {
        log(`Stopped listening on http://127.0.0.1:${port}/`);
        process.exit(0);
    });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
