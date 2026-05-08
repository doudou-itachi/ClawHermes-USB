import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { URL } from "node:url";
import { configureSharedModel, sharedModelConfigStatus } from "./model-config";
import { readLogTail } from "./diagnostics";
import { getStatus, startSingleAdapter, startSkeleton, stopSingleAdapter, stopSkeleton } from "./core";
import { killProcessTree } from "./lifecycle";
import { getRoot } from "./portable";
import { processExists } from "./status";
import { setupDiagnostics } from "./diagnostics";
import { getWeixinChannelStatus, readWeixinChannelLog, startWeixinChannelLogin, stopWeixinChannelLogin } from "./channels";
import { listPortableSkills } from "./skills";

type ControlServerMetadata = {
  serviceId: "control-server";
  displayName: "Control Server";
  status: "running";
  processId: number;
  startedAt: string;
  url: string;
  root: string;
  logFile: string;
};

type ControlServerOptions = {
  port: number;
};

export function startControlServer(usbRoot: string, options: ControlServerOptions) {
  const root = getRoot(usbRoot);
  const existing = readControlServerMetadata(root);
  if (existing && processExists(existing.processId)) return existing;

  const metadataPath = controlServerMetadataPath(root);
  rmSync(metadataPath, { force: true });
  const script = join(root, "core", "node", "dist", "control-server.js");
  const logFile = join(root, "data", "logs", "control-server.log");
  mkdirSync(dirname(logFile), { recursive: true });
  const child = spawn(process.execPath, [script, "--usb-root", root, "--port", String(options.port)], {
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

export function stopControlServer(usbRoot: string): { root: string; stopped: boolean } {
  const root = getRoot(usbRoot);
  const metadata = readControlServerMetadata(root);
  if (!metadata) return { root, stopped: false };
  try {
    killProcessTree(metadata.processId);
  } catch {
    // Already stopped.
  }
  removeControlServerMetadata(root);
  return { root, stopped: true };
}

function waitForControlServerMetadata(root: string): ControlServerMetadata {
  const deadline = Date.now() + 5000;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const metadata = readControlServerMetadata(root);
      if (metadata) return metadata;
    } catch (error) {
      lastError = error;
    }
    sleep(100);
  }
  throw new Error(`Control server did not publish metadata.${lastError instanceof Error ? ` ${lastError.message}` : ""}`);
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function controlServerMetadataPath(root: string): string {
  return join(root, "data", "tmp", "control-server.json");
}

function controlServerPidPath(root: string): string {
  return join(root, "data", "tmp", "pids", "control-server.pid");
}

function readControlServerMetadata(root: string): ControlServerMetadata | null {
  const path = controlServerMetadataPath(root);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as ControlServerMetadata;
}

function writeControlServerMetadata(root: string, metadata: ControlServerMetadata): void {
  const metadataPath = controlServerMetadataPath(root);
  const pidPath = controlServerPidPath(root);
  mkdirSync(dirname(metadataPath), { recursive: true });
  mkdirSync(dirname(pidPath), { recursive: true });
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  writeFileSync(pidPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function removeControlServerMetadata(root: string): void {
  rmSync(controlServerMetadataPath(root), { force: true });
  rmSync(controlServerPidPath(root), { force: true });
}

function parseArgs(argv: string[]): { usbRoot: string; port: number } {
  let usbRoot = process.cwd();
  let port = 17100;
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

if (process.argv[1]?.endsWith("control-server.js")) {
  runControlServer(parseArgs(process.argv.slice(2)));
}

function runControlServer(options: { usbRoot: string; port: number }): void {
  const root = getRoot(options.usbRoot);
  const logFile = join(root, "data", "logs", "control-server.log");
  mkdirSync(dirname(logFile), { recursive: true });

  const server = createServer(async (request, response) => {
    try {
      await routeRequest(root, request, response);
    } catch (error) {
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
    const metadata: ControlServerMetadata = {
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

async function routeRequest(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
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
    sendJson(response, 200, getStatus(root));
    return;
  }
  if (request.method === "GET" && pathname === "/api/install/status") {
    sendJson(response, 200, setupDiagnostics(root));
    return;
  }
  if (request.method === "GET" && pathname === "/api/skills") {
    sendJson(response, 200, listPortableSkills(root));
    return;
  }
  if (request.method === "GET" && pathname === "/api/model-config") {
    const status = sharedModelConfigStatus(root);
    sendJson(response, 200, { ...status, configured: status.exists });
    return;
  }
  if (request.method === "POST" && pathname === "/api/model-config") {
    const body = await readJsonBody(request);
    sendJson(response, 200, configureSharedModel(root, {
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
    sendJson(response, 200, readLogTail(root, service, Number.isFinite(lines) ? lines : 80));
    return;
  }
  if (request.method === "GET" && pathname === "/api/channels/weixin") {
    sendJson(response, 200, getWeixinChannelStatus(root));
    return;
  }
  if (request.method === "GET" && pathname === "/api/channels/weixin/logs") {
    const lines = Number(requestUrl.searchParams.get("lines") || "120");
    sendJson(response, 200, readWeixinChannelLog(root, Number.isFinite(lines) ? lines : 120));
    return;
  }
  if (request.method === "POST" && pathname === "/api/channels/weixin/login") {
    sendJson(response, 200, startWeixinChannelLogin(root));
    return;
  }
  if (request.method === "POST" && pathname === "/api/channels/weixin/stop") {
    sendJson(response, 200, stopWeixinChannelLogin(root));
    return;
  }
  if (request.method === "POST" && pathname === "/api/services/start") {
    sendJson(response, 200, await startSkeleton(root, { attachManagedToParent: true }));
    return;
  }
  if (request.method === "POST" && pathname === "/api/services/stop") {
    sendJson(response, 200, stopSkeleton(root));
    return;
  }
  const serviceMatch = /^\/api\/services\/([^/]+)\/(start|stop)$/.exec(pathname);
  if (request.method === "POST" && serviceMatch) {
    const serviceId = decodeURIComponent(serviceMatch[1]);
    const action = serviceMatch[2];
    if (action === "start") {
      sendJson(response, 200, startSingleAdapter(root, serviceId, { dryRun: false, confirm: true, attachManagedToParent: true }));
      return;
    }
    sendJson(response, 200, stopSingleAdapter(root, serviceId));
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

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function stringBodyValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}
