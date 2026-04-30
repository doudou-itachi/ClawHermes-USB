import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function parseArgs(argv: string[]): { usbRoot: string; port: number } {
  let usbRoot = process.cwd();
  let port = 17000;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--usb-root" && argv[index + 1]) {
      usbRoot = argv[index + 1];
      index += 1;
    } else if (arg === "--port" && argv[index + 1]) {
      port = Number(argv[index + 1]);
      index += 1;
    }
  }
  return { usbRoot: resolve(usbRoot), port };
}

const { usbRoot, port } = parseArgs(process.argv.slice(2));
const portalFile = join(usbRoot, "portal", "index.html");
const statusFile = join(usbRoot, "data", "tmp", "status.json");
const logFile = join(usbRoot, "data", "logs", "portal.log");
mkdirSync(dirname(logFile), { recursive: true });

function log(message: string): void {
  appendFileSync(logFile, `${new Date().toISOString()} [portal] [INFO] ${message}\n`);
}

const server = createServer((request, response) => {
  try {
    if (request.url === "/status.json") {
      if (!existsSync(statusFile)) {
        response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Status snapshot is not available" }));
        return;
      }
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(readFileSync(statusFile));
      return;
    }
    if (request.url !== "/" && request.url !== "/index.html") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    if (!existsSync(portalFile)) {
      response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      response.end("Portal file is not available");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(readFileSync(portalFile));
  } catch (error) {
    log(`Request failed: ${error instanceof Error ? error.message : String(error)}`);
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Portal request failed");
  }
});

server.listen(port, "127.0.0.1", () => {
  log(`Listening on http://127.0.0.1:${port}/`);
});

function shutdown(): void {
  server.close(() => {
    log(`Stopped listening on http://127.0.0.1:${port}/`);
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
