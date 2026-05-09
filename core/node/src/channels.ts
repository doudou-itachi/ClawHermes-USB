import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { resolveServiceEnvironment } from "./environment";
import { killProcessTree } from "./lifecycle";
import { getRoot } from "./portable";
import { processExists } from "./status";
import { withWeixinFetchCompatibility } from "./weixin-compat";

export type ChannelLoginStatus = {
  root: string;
  channel: "openclaw-weixin";
  displayName: "微信";
  status: "missing-plugin" | "running" | "started" | "stopped";
  processId?: number;
  command: string;
  logFile: string;
  messages: string[];
};

const WEIXIN_PACKAGE_PATH = join("node_modules", "@tencent-weixin", "openclaw-weixin");
const WEIXIN_PLUGIN_ID = "openclaw-weixin";

export function getWeixinChannelStatus(usbRoot: string): ChannelLoginStatus {
  const root = getRoot(usbRoot);
  const logFile = weixinLogPath(root);
  const command = weixinCommand(root).join(" ");
  const metadata = readWeixinMetadata(root);
  const installed = weixinPluginInstalled(root);

  if (!installed) {
    return {
      root,
      channel: "openclaw-weixin",
      displayName: "微信",
      status: "missing-plugin",
      command,
      logFile,
      messages: [
        "WeChat channel plugin is not installed under apps/openclaw/node_modules.",
        "Install @tencent-weixin/openclaw-weixin in the OpenClaw payload before scanning to log in.",
      ],
    };
  }

  if (metadata?.processId && processExists(metadata.processId)) {
    return {
      root,
      channel: "openclaw-weixin",
      displayName: "微信",
      status: "running",
      processId: metadata.processId,
      command,
      logFile,
      messages: ["WeChat login is already running. Check the channel log for QR output."],
    };
  }

  return {
    root,
    channel: "openclaw-weixin",
    displayName: "微信",
    status: "stopped",
    command,
    logFile,
    messages: ["WeChat login is ready to start."],
  };
}

export function startWeixinChannelLogin(usbRoot: string): ChannelLoginStatus {
  const root = getRoot(usbRoot);
  const existing = getWeixinChannelStatus(root);
  if (existing.status === "missing-plugin" || existing.status === "running") return existing;

  const appDir = openclawAppDir(root);
  const openclawMjs = openclawEntry(root);
  if (!existsSync(openclawMjs)) {
    return {
      ...existing,
      status: "missing-plugin",
      messages: [`OpenClaw entry is missing: ${openclawMjs}`],
    };
  }

  const logFile = weixinLogPath(root);
  mkdirSync(dirname(logFile), { recursive: true });
  writeFileSync(
    logFile,
    `${new Date().toISOString()} Starting openclaw-weixin login.\n${existing.command}\n\n`,
    "utf8",
  );

  const serviceEnv = resolveServiceEnvironment(root, "openclaw");
  const env = withWeixinFetchCompatibility(root, {
    ...process.env,
    ...serviceEnv.env,
    PATH: patchedPath(root),
  });
  const registration = ensureWeixinPluginRegistered(root, env);
  if (registration.output) {
    writeFileSync(logFile, `${registration.output.trimEnd()}\n\n`, { flag: "a" });
  }
  if (!registration.ok) {
    return {
      ...existing,
      status: "stopped",
      messages: registration.messages,
    };
  }

  const child = spawn(weixinCommand(root)[0], weixinCommand(root).slice(1), {
    cwd: appDir,
    env,
    detached: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const append = (chunk: Buffer) => {
    writeFileSync(logFile, chunk, { flag: "a" });
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  child.on("exit", (code) => {
    writeFileSync(logFile, `\n${new Date().toISOString()} Login process exited with code ${code ?? "unknown"}.\n`, { flag: "a" });
    rmSync(weixinMetadataPath(root), { force: true });
  });
  child.unref();

  const status: ChannelLoginStatus = {
    ...existing,
    status: "started",
    processId: child.pid,
    messages: ["WeChat login command started. Scan the QR code shown in the channel log."],
  };
  mkdirSync(dirname(weixinMetadataPath(root)), { recursive: true });
  writeFileSync(weixinMetadataPath(root), `${JSON.stringify(status, null, 2)}\n`, "utf8");
  return status;
}

export function stopWeixinChannelLogin(usbRoot: string): ChannelLoginStatus {
  const root = getRoot(usbRoot);
  const current = getWeixinChannelStatus(root);
  if (current.processId && processExists(current.processId)) {
    killProcessTree(current.processId);
  }
  rmSync(weixinMetadataPath(root), { force: true });
  return {
    ...getWeixinChannelStatus(root),
    messages: ["WeChat channel login process has been stopped."],
  };
}

export function readWeixinChannelLog(usbRoot: string, lines = 120) {
  const root = getRoot(usbRoot);
  const logFile = weixinLogPath(root);
  if (!existsSync(logFile)) {
    return { target: "channel-weixin", path: logFile, exists: false, lines: [] as string[] };
  }
  const text = readFileSync(logFile, "utf8");
  return {
    target: "channel-weixin",
    path: logFile,
    exists: true,
    lines: text.split(/\r?\n/).slice(-Math.max(1, lines)),
  };
}

function weixinPluginInstalled(root: string): boolean {
  return existsSync(join(openclawAppDir(root), WEIXIN_PACKAGE_PATH));
}

function ensureWeixinPluginRegistered(root: string, env: Record<string, string>): { ok: boolean; messages: string[]; output?: string } {
  const pluginPath = weixinPluginPath(root);
  if (!existsSync(pluginPath)) {
    return {
      ok: false,
      messages: [`WeChat channel plugin directory is missing: ${pluginPath}`],
    };
  }

  if (weixinPluginRegistered(root, env, pluginPath)) {
    return {
      ok: true,
      messages: ["WeChat channel plugin is registered."],
    };
  }

  const command = [
    nodeCommand(root),
    openclawEntry(root),
    "plugins",
    "install",
    pluginPath,
    "--link",
  ];
  const result = spawnSync(command[0], command.slice(1), {
    cwd: openclawAppDir(root),
    env,
    shell: false,
    windowsHide: true,
    encoding: "utf8",
    timeout: 90_000,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

  if (result.error) {
    return {
      ok: false,
      output,
      messages: [`Failed to register WeChat channel plugin: ${result.error.message}`],
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      output,
      messages: [`Failed to register WeChat channel plugin. Exit code: ${result.status ?? "unknown"}.`],
    };
  }

  if (!weixinPluginRegistered(root, env, pluginPath)) {
    return {
      ok: false,
      output,
      messages: ["WeChat channel plugin registration command completed, but OpenClaw config still does not reference the plugin."],
    };
  }

  return {
    ok: true,
    output,
    messages: ["WeChat channel plugin was registered from the local payload."],
  };
}

function weixinPluginRegistered(root: string, env: Record<string, string>, pluginPath: string): boolean {
  const expectedPath = normalizePathForCompare(pluginPath);
  const config = readJsonObject(env.OPENCLAW_CONFIG_PATH || join(root, "data", "openclaw", "openclaw.json"));
  const loadPaths = Array.isArray(config?.plugins?.load?.paths) ? config.plugins.load.paths : [];
  const configHasPath = loadPaths.some((item: unknown) => typeof item === "string" && normalizePathForCompare(item) === expectedPath);
  const configEnablesPlugin = config?.plugins?.entries?.[WEIXIN_PLUGIN_ID]?.enabled === true;

  const stateDir = env.OPENCLAW_STATE_DIR || join(root, "data", "openclaw");
  const installs = readJsonObject(join(stateDir, "plugins", "installs.json"));
  const record = installs?.installRecords?.[WEIXIN_PLUGIN_ID];
  const recordPath = typeof record?.installPath === "string" ? record.installPath : typeof record?.sourcePath === "string" ? record.sourcePath : "";
  const recordHasPath = normalizePathForCompare(recordPath) === expectedPath;

  return configHasPath && configEnablesPlugin && recordHasPath;
}

function readJsonObject(filePath: string): any {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePathForCompare(value: string): string {
  return resolve(value).replaceAll("/", "\\").toLowerCase();
}

function readWeixinMetadata(root: string): ChannelLoginStatus | null {
  try {
    return JSON.parse(readFileSync(weixinMetadataPath(root), "utf8")) as ChannelLoginStatus;
  } catch {
    return null;
  }
}

function weixinCommand(root: string): string[] {
  return [
    nodeCommand(root),
    openclawEntry(root),
    "channels",
    "login",
    "--channel",
    "openclaw-weixin",
  ];
}

function nodeCommand(root: string): string {
  const portableNode = join(root, "runtimes", "windows", "node", "node.exe");
  return existsSync(portableNode) ? portableNode : "node";
}

function patchedPath(root: string): string {
  return [
    join(root, "runtimes", "windows", "node"),
    join(openclawAppDir(root), "node_modules", ".bin"),
    process.env.PATH ?? "",
  ].filter(Boolean).join(delimiter);
}

function openclawAppDir(root: string): string {
  return join(root, "apps", "openclaw");
}

function openclawEntry(root: string): string {
  return join(openclawAppDir(root), "openclaw.mjs");
}

function weixinPluginPath(root: string): string {
  return join(openclawAppDir(root), WEIXIN_PACKAGE_PATH);
}

function weixinLogPath(root: string): string {
  return join(root, "data", "logs", "channel-weixin.log");
}

function weixinMetadataPath(root: string): string {
  return join(root, "data", "tmp", "pids", "channel-weixin.json");
}
