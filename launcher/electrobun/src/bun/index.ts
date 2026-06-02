import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserView, BrowserWindow, Utils } from "electrobun/bun";
import type { BootstrapPayload, ChannelLoginStatus, DeviceBindingStatus, ModelConfig, SkillsPayload, StatusPayload } from "../shared/types";

type ControlServerMetadata = {
  url: string;
  root: string;
  processId?: number;
};

const root = findUsbRoot();
let controlUrl = "";
let controlServerPromise: Promise<string> | undefined;
let mainWindow: BrowserWindow | undefined;
let closingFromUi = false;

writeElectrobunLog(`Electrobun control starting. root=${root}`);

const rpc = BrowserView.defineRPC({
  maxRequestTime: Infinity,
  handlers: {
    requests: {
      getBootstrap: async (): Promise<BootstrapPayload> => ({ root, controlUrl: await getControlUrlOrEmpty() }),
      getStatus: () => getStatusPayload(),
      getLogs: () => requestJson("/api/logs?service=launcher&lines=140"),
      getSkills: () => requestJson("/api/skills") as Promise<SkillsPayload>,
      getDeviceBinding: () => requestJson("/api/device-binding") as Promise<DeviceBindingStatus>,
      bindDevice: () => requestJson("/api/device-binding/bind", { method: "POST", body: {} }) as Promise<DeviceBindingStatus>,
      getWeixinChannelStatus: () => requestJson("/api/channels/weixin") as Promise<ChannelLoginStatus>,
      getWeixinChannelLogs: () => requestJson("/api/channels/weixin/logs?lines=160"),
      startWeixinChannelLogin: () => requestJson("/api/channels/weixin/login", { method: "POST", body: {} }) as Promise<ChannelLoginStatus>,
      stopWeixinChannelLogin: () => requestJson("/api/channels/weixin/stop", { method: "POST", body: {} }) as Promise<ChannelLoginStatus>,
      getModelConfig: () => requestJson("/api/model-config"),
      startAll: () => startAllServices(),
      stopAll: () => stopAllServices(),
      saveModelConfig: (config: unknown) => {
        const modelConfig = config as ModelConfig;
        return requestJson("/api/model-config", {
          method: "POST",
          body: {
            providerType: "openai-compatible",
            apiUrl: modelConfig.apiUrl,
            model: modelConfig.model,
            apiKey: modelConfig.apiKey,
            apply: "both",
          },
        });
      },
      openUrl: (payload: unknown) => {
        const target = payload as { url?: string };
        if (target.url) Utils.openExternal(target.url);
        return { opened: true };
      },
      shutdown: async () => {
        await cleanupBeforeExit();
        return { status: "stopping" };
      },
      minimizeWindow: () => {
        mainWindow?.minimize();
        return { minimized: true };
      },
      maximizeWindow: () => {
        if (mainWindow?.isMaximized()) {
          mainWindow.unmaximize();
          return { maximized: false };
        }
        mainWindow?.maximize();
        return { maximized: true };
      },
      closeWindow: async () => {
        beginImmediateClose();
        return { closed: true, cleanup: "foreground" };
      },
    },
  },
});

mainWindow = new BrowserWindow({
  title: "DTclaw Control",
  url: "views://mainview/index.html",
  frame: {
    width: 1120,
    height: 760,
    x: 80,
    y: 60,
  },
  styleMask: {
    Resizable: true,
  },
  titleBarStyle: "hidden",
  rpc,
});

writeElectrobunLog("BrowserWindow created.");
void getControlUrl()
  .then((url) => {
    writeElectrobunLog(`Control server ready: ${url}`);
  })
  .catch((error) => {
    writeElectrobunLog(`Control server startup failed: ${error instanceof Error ? error.message : String(error)}`);
  });

mainWindow.on("close", () => {
  if (!closingFromUi) beginImmediateClose();
});

function beginImmediateClose(): void {
  if (closingFromUi) return;
  closingFromUi = true;
  void cleanupBeforeExit()
    .catch((error) => {
      console.error("cleanup before exit failed", error);
    })
    .finally(() => {
      Utils.quit();
    });
}

async function requestJson(path: string, options: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const baseUrl = await getControlUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: options.body ? { "content-type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const payload = await response.json() as { error?: { message?: string } };
        if (payload.error?.message) detail = payload.error.message;
      } catch {
        // Keep the HTTP status when the response is not JSON.
      }
      throw new Error(`Control API failed: ${detail}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getControlUrl(): Promise<string> {
  if (controlUrl) return controlUrl;
  if (!controlServerPromise) {
    controlServerPromise = Promise.resolve()
      .then(() => ensureControlServer(root).replace(/\/$/, ""))
      .then((url) => {
        controlUrl = url;
        return url;
      })
      .catch((error) => {
        controlServerPromise = undefined;
        throw error;
      });
  }
  return controlServerPromise;
}

async function getControlUrlOrEmpty(): Promise<string> {
  try {
    return await getControlUrl();
  } catch (error) {
    writeElectrobunLog(`Control server bootstrap failed; UI will use fallback status paths. ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

async function requestJsonWithTimeout(path: string, options: { method?: string; body?: unknown } = {}, timeoutMs = 4000) {
  return requestJson(path, { ...options, timeoutMs });
}

async function cleanupBeforeExit(): Promise<void> {
  try {
    await requestJsonWithTimeout("/api/channels/weixin/stop", { method: "POST", body: {} });
  } catch {
    // Channel login may not have been started in this build.
  }
  await stopAllServices({ waitForStopped: true });
  try {
    await requestJsonWithTimeout("/api/shutdown", { method: "POST", body: {} });
  } catch {
    // The process may have exited before the response is read.
  }
  await waitForControlServerShutdown();
}

async function getStatusPayload(): Promise<StatusPayload> {
  try {
    return await requestJson("/api/status") as StatusPayload;
  } catch (error) {
    writeElectrobunLog(`Control API status failed; falling back to status snapshot. ${error instanceof Error ? error.message : String(error)}`);
    return readStatusSnapshot();
  }
}

async function startAllServices(): Promise<unknown> {
  try {
    return await requestJson("/api/services/start", { method: "POST", body: {} });
  } catch (error) {
    writeElectrobunLog(`Control API start failed; falling back to CLI start. ${error instanceof Error ? error.message : String(error)}`);
    return runClawHermesLifecycle("start", { throwOnFailure: true });
  }
}

async function stopAllServices(options: { waitForStopped?: boolean } = {}): Promise<unknown> {
  let apiResult: unknown = null;
  try {
    apiResult = await requestJsonWithTimeout("/api/services/stop", { method: "POST", body: {} }, 5000);
    if (options.waitForStopped) await waitForServicesStopped();
  } catch (error) {
    writeElectrobunLog(`Control API stop failed; falling back to CLI stop. ${error instanceof Error ? error.message : String(error)}`);
  }
  const cliResult = runClawHermesLifecycle("stop", { throwOnFailure: false });
  return apiResult ?? cliResult;
}

async function waitForServicesStopped(timeoutMs = 9000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await requestJsonWithTimeout("/api/status", {}, 3000) as StatusPayload;
    const running = (status.services ?? []).filter((service) => service.status === "running");
    if (running.length === 0) return true;
    await requestJsonWithTimeout("/api/services/stop", { method: "POST", body: {} }, 3000);
    await sleep(250);
  }
  return false;
}

async function waitForControlServerShutdown(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!controlUrl || !(await ping(`${controlUrl}/api/health`))) return true;
    await sleep(120);
  }
  return false;
}

function ensureControlServer(usbRoot: string): string {
  writeElectrobunLog("Ensuring control server.");
  const metadata = readControlServerMetadata(usbRoot);
  if (metadata && pingSync(`${metadata.url.replace(/\/$/, "")}/api/health`)) {
    writeElectrobunLog(`Reusing control server metadata: ${metadata.url}`);
    return metadata.url;
  }

  const command = [
    ...nodeCommand(usbRoot),
    join(usbRoot, "core", "node", "dist", "clawhermes.js"),
    "control-server",
    "--usb-root",
    usbRoot,
    "--port",
    "0",
    "--json",
  ];
  writeElectrobunLog(`Starting control server command: ${command.join(" ")}`);
  const completed = spawnSync(command[0], command.slice(1), {
    cwd: usbRoot,
    encoding: "utf8",
    timeout: 10000,
    windowsHide: true,
  });
  writeElectrobunLog(`Control server command completed. status=${completed.status ?? "null"} signal=${completed.signal ?? "null"} error=${completed.error?.message ?? "none"}`);
  if (completed.status !== 0) {
    if (completed.stdout) writeElectrobunLog(`Control server stdout: ${completed.stdout.slice(-2000)}`);
    if (completed.stderr) writeElectrobunLog(`Control server stderr: ${completed.stderr.slice(-2000)}`);
    throw new Error(completed.stderr || "Failed to start control server.");
  }
  const payload = JSON.parse(completed.stdout) as ControlServerMetadata;
  return payload.url;
}

function readControlServerMetadata(usbRoot: string): ControlServerMetadata | null {
  const path = join(usbRoot, "data", "tmp", "control-server.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ControlServerMetadata;
  } catch {
    return null;
  }
}

function findUsbRoot(): string {
  if (process.env.CLAWHERMES_USB_ROOT) return resolve(process.env.CLAWHERMES_USB_ROOT);
  const start = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...rootHintCandidates(start),
    ...rootHintCandidates(process.cwd()),
    process.cwd(),
    start,
    ...ancestorPaths(start),
    ...ancestorPaths(process.cwd()),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, "core", "node", "dist", "clawhermes.js"))) {
      return candidate;
    }
  }
  return resolve(start, "../../../..");
}

function rootHintCandidates(start: string): string[] {
  const candidates: string[] = [];
  for (const candidate of [start, ...ancestorPaths(start)]) {
    for (const hintPath of [
      join(candidate, "Resources", "clawhermes-usb-root.txt"),
      join(candidate, "clawhermes-usb-root.txt"),
    ]) {
      if (!existsSync(hintPath)) continue;
      try {
        candidates.push(readFileSync(hintPath, "utf8").trim());
      } catch {
        // Ignore malformed or unreadable sidecar hints.
      }
    }
  }
  return candidates.filter(Boolean);
}

function ancestorPaths(start: string): string[] {
  const paths: string[] = [];
  let current = resolve(start);
  while (dirname(current) !== current) {
    current = dirname(current);
    paths.push(current);
  }
  return paths;
}

function nodeCommand(usbRoot: string): string[] {
  if (process.platform === "darwin") {
    const platform = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
    const portableNode = join(usbRoot, "runtimes", "macos", "node", platform, "bin", "node");
    return existsSync(portableNode) ? [portableNode] : ["node"];
  }
  const portableNode = join(usbRoot, "runtimes", "windows", "node", "node.exe");
  return existsSync(portableNode) ? [portableNode] : ["node"];
}

function readStatusSnapshot(): StatusPayload {
  const path = join(root, "data", "tmp", "status.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as StatusPayload;
  } catch {
    return { services: [] };
  }
}

function runClawHermesLifecycle(action: "start" | "stop", options: { throwOnFailure: boolean }): unknown {
  const command = [
    ...nodeCommand(root),
    join(root, "core", "node", "dist", "clawhermes.js"),
    action,
    "--usb-root",
    root,
    "--json",
  ];
  writeElectrobunLog(`Running CLI lifecycle fallback: ${command.join(" ")}`);
  const completed = spawnSync(command[0], command.slice(1), {
    cwd: root,
    encoding: "utf8",
    timeout: action === "start" ? 20000 : 10000,
    windowsHide: true,
  });
  writeElectrobunLog(`CLI lifecycle fallback completed. action=${action} status=${completed.status ?? "null"} signal=${completed.signal ?? "null"} error=${completed.error?.message ?? "none"}`);
  if (completed.stdout) writeElectrobunLog(`CLI lifecycle stdout: ${completed.stdout.slice(-2000)}`);
  if (completed.stderr) writeElectrobunLog(`CLI lifecycle stderr: ${completed.stderr.slice(-2000)}`);
  if (completed.status !== 0 && options.throwOnFailure) {
    throw new Error(completed.stderr || completed.error?.message || `${action} fallback failed.`);
  }
  try {
    return completed.stdout ? JSON.parse(completed.stdout) : { root, action, status: completed.status };
  } catch {
    return { root, action, status: completed.status, stdout: completed.stdout, stderr: completed.stderr };
  }
}

async function ping(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

function pingSync(url: string): boolean {
  const command = nodeCommand(root);
  const completed = spawnSync(command[0], [...command.slice(1), "-e", `fetch(${JSON.stringify(url)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`], {
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  });
  return completed.status === 0;
}

function writeElectrobunLog(message: string): void {
  try {
    const logFile = join(root, "data", "logs", "electrobun-control.log");
    mkdirSync(dirname(logFile), { recursive: true });
    appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch (error) {
    console.error("electrobun log write failed", error);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
