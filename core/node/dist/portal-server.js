"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_http_1 = require("node:http");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
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
const logFile = (0, node_path_1.join)(usbRoot, "data", "logs", "portal.log");
(0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(logFile), { recursive: true });
function log(message) {
    (0, node_fs_1.appendFileSync)(logFile, `${new Date().toISOString()} [portal] [INFO] ${message}\n`);
}
const server = (0, node_http_1.createServer)((request, response) => {
    try {
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
