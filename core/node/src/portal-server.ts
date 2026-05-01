import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadAdapters } from "./adapters";
import { verifyAdapter } from "./adapter-verification";
import { readLogTail } from "./diagnostics";
import type { WslDiagnostic } from "./types";

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
const setupFile = join(usbRoot, "data", "tmp", "setup.json");
const backupRoot = join(usbRoot, "data", "backups");
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
    if (request.url === "/setup.json") {
      if (!existsSync(setupFile)) {
        response.writeHead(503, { "content-type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ error: "Setup snapshot is not available" }));
        return;
      }
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(readFileSync(setupFile));
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
    if (request.url === "/logs.json") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(logsSnapshot(), null, 2));
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

function backupSnapshot() {
  const backups = existsSync(backupRoot)
    ? readdirSync(backupRoot)
      .filter((fileName) => fileName.toLowerCase().endsWith(".zip"))
      .map((fileName) => {
        const path = join(backupRoot, fileName);
        const stats = statSync(path);
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
  const wslDiagnosticsByDistro = new Map<string, WslDiagnostic>();
  return {
    root: usbRoot,
    generatedAt: new Date().toISOString(),
    adapters: loadAdapters(usbRoot).map((adapter) => {
      const verification = verifyAdapter(usbRoot, adapter.id, {
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

function logsSnapshot() {
  const adapters = loadAdapters(usbRoot);
  const targets = [
    "launcher",
    "portal",
    ...adapters.map((adapter) => adapter.id),
    ...adapters.map((adapter) => `setup-${adapter.id}`),
  ];
  return {
    root: usbRoot,
    generatedAt: new Date().toISOString(),
    logs: targets.map((target) => readLogTail(usbRoot, target, 80)),
  };
}

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
