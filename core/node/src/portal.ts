import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { get } from "node:http";
import type { ServiceStatus } from "./types";
import { killProcessTree } from "./lifecycle";
import { getRoot, writeLog } from "./portable";

export const PORTAL_URL = "http://127.0.0.1:17000/";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function generatePortal(usbRoot: string, services: ServiceStatus[]): { path: string; url: string } {
  const root = getRoot(usbRoot);
  const portalPath = join(root, "portal", "index.html");
  mkdirSync(dirname(portalPath), { recursive: true });
  const rows = services.map((service) => {
    const logPath = service.logFile.startsWith(root)
      ? service.logFile.slice(root.length).replace(new RegExp(`^\\${sep}`), "").replaceAll("\\", "/")
      : service.logFile;
    const url = service.portalUrl ? `<a href="${escapeHtml(service.portalUrl)}">${escapeHtml(service.portalUrl)}</a>` : "<span>Pending upstream URL</span>";
    const healthLabel = service.health.ready ? "Ready" : "Not ready";
    const health = `<span data-health-label>${escapeHtml(healthLabel)}</span> <span data-health-type>(${escapeHtml(service.health.type)})</span><br><small data-health-reason>${escapeHtml(service.health.reason)}</small>`;
    return `<tr data-service-id="${escapeHtml(service.id)}"><td>${escapeHtml(service.displayName)}</td><td>${escapeHtml(service.id)}</td><td data-status-cell>${escapeHtml(service.status)}</td><td>${health}</td><td>${url}</td><td><code>${escapeHtml(logPath)}</code></td></tr>`;
  }).join("\n          ");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ClawHermes-USB Portal</title>
  <style>
    body { font-family: Segoe UI, Arial, sans-serif; margin: 32px; color: #202124; background: #f7f8fa; }
    main { max-width: 1080px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 16px; }
    section { margin-top: 24px; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { border: 1px solid #d8dde6; padding: 10px; text-align: left; vertical-align: top; }
    th { background: #eef2f7; }
    code { font-family: Consolas, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>ClawHermes-USB Portal</h1>
    <section>
      <p><strong>Project root:</strong> <code>${escapeHtml(root)}</code></p>
      <p><strong>Data root:</strong> <code>${escapeHtml(join(root, "data"))}</code></p>
      <p><strong>Generated:</strong> <code>${new Date().toISOString()}</code></p>
    </section>
    <section>
      <h2>Services</h2>
      <table>
        <thead><tr><th>Service</th><th>ID</th><th>Status</th><th>Health</th><th>URL</th><th>Log</th></tr></thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Operations</h2>
      <p>Use <code>launcher/windows/Status.bat</code> to refresh service state and <code>launcher/windows/Stop.bat</code> to stop placeholder services.</p>
      <p>Use <code>launcher/windows/Backup.bat</code> to create a portable backup. Latest backup: <span data-backup-latest>Checking...</span></p>
    </section>
  </main>
  <script>
    async function refreshStatus() {
      try {
        const response = await fetch('/status.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        for (const service of payload.services || []) {
          const row = document.querySelector('[data-service-id="' + service.id + '"]');
          if (!row) continue;
          const statusCell = row.querySelector('[data-status-cell]');
          const healthLabel = row.querySelector('[data-health-label]');
          const healthType = row.querySelector('[data-health-type]');
          const healthReason = row.querySelector('[data-health-reason]');
          if (statusCell) statusCell.textContent = service.status || 'unknown';
          if (healthLabel) healthLabel.textContent = service.health && service.health.ready ? 'Ready' : 'Not ready';
          if (healthType) healthType.textContent = '(' + ((service.health && service.health.type) || 'unknown') + ')';
          if (healthReason) healthReason.textContent = (service.health && service.health.reason) || '';
        }
      } catch {
        // Keep the last rendered status visible when refresh fails.
      }
    }
    async function refreshBackups() {
      try {
        const response = await fetch('/backups.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const target = document.querySelector('[data-backup-latest]');
        if (!target) return;
        if (!payload.latest) {
          target.textContent = 'none';
          return;
        }
        target.textContent = payload.latest.fileName + ' (' + Math.ceil((payload.latest.sizeBytes || 0) / 1024) + ' KB)';
      } catch {
        // Backup status is optional for the static portal.
      }
    }
    refreshStatus();
    refreshBackups();
    window.setInterval(refreshStatus, 5000);
    window.setInterval(refreshBackups, 15000);
  </script>
</body>
</html>
`;
  writeFileSync(portalPath, html, "utf8");
  writeLog(root, "portal", "INFO", "Generated portal/index.html.");
  return { path: portalPath, url: PORTAL_URL };
}

function portalPidFile(usbRoot: string): string {
  return join(getRoot(usbRoot), "data", "tmp", "pids", "portal.pid");
}

function portalServerPath(usbRoot: string): string {
  return join(getRoot(usbRoot), "core", "node", "dist", "portal-server.js");
}

function portalProcesses(usbRoot: string): Array<{ ProcessId: number; CommandLine: string }> {
  const root = getRoot(usbRoot);
  try {
    const output = execFileSync("powershell", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*portal-server.js*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
    ], { encoding: "utf8" }).trim();
    if (!output) return [];
    const parsed = JSON.parse(output) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter((row): row is { ProcessId: number; CommandLine: string } => {
      const item = row as { ProcessId?: number; CommandLine?: string };
      return (
        typeof item.ProcessId === "number" &&
        typeof item.CommandLine === "string" &&
        /\bnode(?:\.exe)?\b/i.test(item.CommandLine) &&
        item.CommandLine.includes("portal-server.js") &&
        item.CommandLine.includes(root)
      );
    });
  } catch {
    return [];
  }
}

function portalProcessById(usbRoot: string, pid: number): { ProcessId: number; CommandLine: string } | null {
  return portalProcesses(usbRoot).find((processInfo) => processInfo.ProcessId === pid) ?? null;
}

async function tcpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => resolveAvailable(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
  });
}

async function portalReady(timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolveReady) => {
      const request = get(PORTAL_URL, (response) => {
        response.resume();
        resolveReady(response.statusCode === 200);
      });
      request.setTimeout(500, () => {
        request.destroy();
        resolveReady(false);
      });
      request.on("error", () => resolveReady(false));
    });
    if (ready) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  return false;
}

function portalMetadata(root: string, processId: number) {
  return {
    serviceId: "portal",
    displayName: "Portal",
    status: "running",
    processId,
    startedAt: new Date().toISOString(),
    url: PORTAL_URL,
    logFile: join(root, "data", "logs", "portal.log"),
  };
}

export async function startPortalServer(usbRoot: string) {
  const root = getRoot(usbRoot);
  const pidFile = portalPidFile(root);
  mkdirSync(dirname(pidFile), { recursive: true });
  if (existsSync(pidFile)) {
    const existing = JSON.parse(readFileSync(pidFile, "utf8")) as { processId?: number };
    if (existing.processId && portalProcessById(root, existing.processId)) return existing;
    rmSync(pidFile, { force: true });
  }
  const existingProcess = portalProcesses(root)[0];
  if (existingProcess) {
    const metadata = portalMetadata(root, existingProcess.ProcessId);
    writeFileSync(pidFile, JSON.stringify(metadata, null, 2), "utf8");
    writeLog(root, "portal", "INFO", "Reused existing portal server on http://127.0.0.1:17000/.");
    return metadata;
  }
  if (!(await tcpPortAvailable(17000))) {
    throw new Error("Port 17000 is already in use. Stop the conflicting process or change config/defaults/ports.json.");
  }
  const child = spawn(process.execPath, [portalServerPath(root), "--usb-root", root, "--port", "17000"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  if (!(await portalReady())) {
    if (child.pid && portalProcessById(root, child.pid)) process.kill(child.pid);
    throw new Error("Portal server did not become reachable at http://127.0.0.1:17000/.");
  }
  const metadata = portalMetadata(root, child.pid ?? 0);
  writeFileSync(pidFile, JSON.stringify(metadata, null, 2), "utf8");
  writeLog(root, "portal", "INFO", "Started portal server on http://127.0.0.1:17000/.");
  return metadata;
}

export function getPortalStatus(usbRoot: string): ServiceStatus {
  const root = getRoot(usbRoot);
  const pidFile = portalPidFile(root);
  let status = "stopped";
  let processId: number | null = null;
  if (existsSync(pidFile)) {
    const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { processId?: number };
    if (metadata.processId && portalProcessById(root, metadata.processId)) {
      status = "running";
      processId = metadata.processId;
    } else if (portalProcesses(root).length > 0) {
      status = "running";
      processId = portalProcesses(root)[0]?.ProcessId ?? null;
    } else {
      rmSync(pidFile, { force: true });
      status = "stopped";
    }
  } else if (portalProcesses(root).length > 0) {
    status = "running";
    processId = portalProcesses(root)[0]?.ProcessId ?? null;
  }
  return {
    id: "portal",
    displayName: "Portal",
    status,
    pidFile,
    logFile: join(root, "data", "logs", "portal.log"),
    portalUrl: PORTAL_URL,
    processId,
    placeholder: false,
    health: {
      type: "http",
      ready: status === "running",
      reason: status === "running" ? "Portal HTTP server is running." : "Portal HTTP server is stopped.",
    },
  };
}

export function stopPortalServer(usbRoot: string): boolean {
  const root = getRoot(usbRoot);
  const pidFile = portalPidFile(root);
  let stopped = false;
  if (existsSync(pidFile)) {
    const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { processId?: number };
    if (metadata.processId && portalProcessById(root, metadata.processId)) {
      killProcessTree(metadata.processId);
      stopped = true;
    }
    rmSync(pidFile, { force: true });
  }
  for (const processInfo of portalProcesses(root)) {
    try {
      killProcessTree(processInfo.ProcessId);
      stopped = true;
    } catch {
      // Already gone.
    }
  }
  if (stopped) writeLog(root, "portal", "INFO", "Stopped portal server.");
  return stopped;
}
