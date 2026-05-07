import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { resolveServiceEnvironment } from "./environment";
import { killProcessTree } from "./lifecycle";
import { getRoot } from "./portable";
import { processExists } from "./status";

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
  const env = {
    ...process.env,
    ...serviceEnv.env,
    PATH: patchedPath(root),
  };
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

function weixinLogPath(root: string): string {
  return join(root, "data", "logs", "channel-weixin.log");
}

function weixinMetadataPath(root: string): string {
  return join(root, "data", "tmp", "pids", "channel-weixin.json");
}
