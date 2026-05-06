import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { get } from "node:http";
import type { ServiceStatus } from "./types";
import { killProcessTree } from "./lifecycle";
import { getRoot, writeLog } from "./portable";
import { runtimePortalUrl } from "./ports-runtime";

export const PORTAL_URL = "http://127.0.0.1:17000/";

type PortalMetadata = {
  serviceId: "portal";
  displayName: "Portal";
  status: "running";
  processId: number;
  startedAt: string;
  url: string;
  logFile: string;
};

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function generatePortal(usbRoot: string, services: ServiceStatus[]): { path: string; url: string } {
  const root = getRoot(usbRoot);
  const url = runtimePortalUrl(root);
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
      <ul data-operation-actions>
        <li>Checking operation commands...</li>
      </ul>
    </section>
    <section>
      <h2>Setup actions</h2>
      <ul data-setup-actions>
        <li>Checking setup recommendations...</li>
      </ul>
    </section>
    <section>
      <h2>WSL2 readiness</h2>
      <ul data-wsl2-readiness>
        <li>Check Hermes Agent with <code>node core/node/dist/clawhermes.js wsl-workflow hermes-agent --json</code> and <code>node core/node/dist/clawhermes.js verify-adapter hermes-agent --json</code>.</li>
        <li>Check OpenClaw with <code>node core/node/dist/clawhermes.js wsl-workflow openclaw --json</code> and <code>node core/node/dist/clawhermes.js verify-adapter openclaw --json</code>.</li>
      </ul>
    </section>
    <section>
      <h2>Adapter verification</h2>
      <ul data-adapter-verification>
        <li>Checking adapter verification gates...</li>
      </ul>
    </section>
    <section>
      <h2>Logs</h2>
      <div data-log-viewer>
        <p>Checking recent logs...</p>
      </div>
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
    async function refreshSetupActions() {
      try {
        const response = await fetch('/setup.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const target = document.querySelector('[data-setup-actions]');
        if (!target) return;
        const actions = (payload.actions || []).slice(0, 8);
        if (actions.length === 0) {
          target.innerHTML = '<li>No setup actions pending.</li>';
          return;
        }
        target.innerHTML = '';
        for (const action of actions) {
          const item = document.createElement('li');
          const title = document.createElement('strong');
          title.textContent = '[' + (action.severity || 'info') + '] ' + (action.title || action.id || 'Setup action');
          item.appendChild(title);
          if (action.command) {
            const command = document.createElement('code');
            command.textContent = action.command;
            item.appendChild(document.createTextNode(' '));
            item.appendChild(command);
          }
          target.appendChild(item);
        }
        refreshWslReadiness(payload);
      } catch {
        // Keep the static placeholder if the snapshot is not available.
      }
    }
    function refreshWslReadiness(payload) {
      const target = document.querySelector('[data-wsl2-readiness]');
      if (!target) return;
      const artifacts = payload.wslArtifacts || [];
      if (artifacts.length === 0) return;
      target.innerHTML = '';
      for (const artifact of artifacts) {
        const item = document.createElement('li');
        const serviceId = artifact.serviceId || 'unknown-service';
        const status = artifact.sourceArchiveExists ? 'rootfs archive present' : 'rootfs archive missing';
        const label = document.createElement('strong');
        label.textContent = serviceId + ': ' + status;
        item.appendChild(label);
        item.appendChild(document.createTextNode(' '));
        const workflow = document.createElement('code');
        workflow.textContent = 'node core/node/dist/clawhermes.js wsl-workflow ' + serviceId + ' --json';
        item.appendChild(workflow);
        item.appendChild(document.createTextNode(' '));
        const verify = document.createElement('code');
        verify.textContent = 'node core/node/dist/clawhermes.js verify-adapter ' + serviceId + ' --json';
        item.appendChild(verify);
        target.appendChild(item);
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
    async function refreshAdapterVerification() {
      try {
        const response = await fetch('/adapter-verification.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const target = document.querySelector('[data-adapter-verification]');
        if (!target) return;
        const adapters = payload.adapters || [];
        if (adapters.length === 0) {
          target.innerHTML = '<li>No adapters found.</li>';
          return;
        }
        target.innerHTML = '';
        for (const adapter of adapters) {
          const item = document.createElement('li');
          const label = document.createElement('strong');
          const ready = adapter.productionReadyCandidate ? 'ready candidate' : 'blocked';
          label.textContent = (adapter.displayName || adapter.serviceId || 'Adapter') + ': ' + ready;
          item.appendChild(label);
          const failedChecks = (adapter.checks || []).filter((check) => check.status !== 'pass').slice(0, 3);
          if (failedChecks.length > 0) {
            const details = document.createElement('span');
            details.textContent = ' - ' + failedChecks.map((check) => check.label || check.id).join(', ');
            item.appendChild(details);
          }
          target.appendChild(item);
        }
      } catch {
        // Adapter verification is an operator aid; keep the portal usable if it fails.
      }
    }
    async function refreshLogs() {
      try {
        const response = await fetch('/logs.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const target = document.querySelector('[data-log-viewer]');
        if (!target) return;
        const logs = (payload.logs || []).filter((log) => log.exists).slice(0, 6);
        if (logs.length === 0) {
          target.innerHTML = '<p>No log files exist yet.</p>';
          return;
        }
        target.innerHTML = '';
        for (const log of logs) {
          const block = document.createElement('section');
          const title = document.createElement('h3');
          title.textContent = log.target || 'log';
          const path = document.createElement('code');
          path.textContent = log.path || '';
          const lines = document.createElement('pre');
          lines.textContent = (log.lines || []).slice(-8).join('\\n') || '(empty)';
          block.appendChild(title);
          block.appendChild(path);
          block.appendChild(lines);
          target.appendChild(block);
        }
      } catch {
        // Log viewing should never prevent the rest of the portal from rendering.
      }
    }
    async function refreshOperations() {
      try {
        const response = await fetch('/operations.json', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const target = document.querySelector('[data-operation-actions]');
        if (!target) return;
        const actions = payload.actions || [];
        if (actions.length === 0) {
          target.innerHTML = '<li>No operation commands are available.</li>';
          return;
        }
        target.innerHTML = '';
        for (const action of actions) {
          const item = document.createElement('li');
          const label = document.createElement('strong');
          label.textContent = action.label || action.id || 'Operation';
          const command = document.createElement('code');
          command.textContent = action.batchCommand || action.cliCommand || '';
          item.appendChild(label);
          item.appendChild(document.createTextNode(action.mutatesState ? ' requires explicit user action: ' : ' '));
          item.appendChild(command);
          target.appendChild(item);
        }
      } catch {
        // Operation commands are static guidance; keep the existing text visible if refresh fails.
      }
    }
    refreshStatus();
    refreshSetupActions();
    refreshBackups();
    refreshAdapterVerification();
    refreshLogs();
    refreshOperations();
    window.setInterval(refreshStatus, 5000);
    window.setInterval(refreshSetupActions, 15000);
    window.setInterval(refreshBackups, 15000);
    window.setInterval(refreshAdapterVerification, 30000);
    window.setInterval(refreshLogs, 15000);
    window.setInterval(refreshOperations, 30000);
  </script>
</body>
</html>
`;
  writeFileSync(portalPath, html, "utf8");
  writeLog(root, "portal", "INFO", "Generated portal/index.html.");
  return { path: portalPath, url };
}

function portalPidFile(usbRoot: string): string {
  return join(getRoot(usbRoot), "data", "tmp", "pids", "portal.pid");
}

function portalServerPath(usbRoot: string): string {
  return join(getRoot(usbRoot), "core", "node", "dist", "portal-server.js");
}

function portalProcessById(_usbRoot: string, pid: number): { ProcessId: number } | null {
  return processExists(pid) ? { ProcessId: pid } : null;
}

async function tcpPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolveAvailable) => {
    const server = createServer();
    server.once("error", () => resolveAvailable(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
  });
}

async function portalReady(url: string, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise<boolean>((resolveReady) => {
      const request = get(url, (response) => {
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

function portalMetadata(root: string, processId: number, url = runtimePortalUrl(root)): PortalMetadata {
  return {
    serviceId: "portal",
    displayName: "Portal",
    status: "running",
    processId,
    startedAt: new Date().toISOString(),
    url,
    logFile: join(root, "data", "logs", "portal.log"),
  };
}

export async function startPortalServer(usbRoot: string, port = 17000) {
  const root = getRoot(usbRoot);
  const url = `http://127.0.0.1:${port}/`;
  const pidFile = portalPidFile(root);
  mkdirSync(dirname(pidFile), { recursive: true });
  if (existsSync(pidFile)) {
    const existing = JSON.parse(readFileSync(pidFile, "utf8")) as Partial<PortalMetadata>;
    if (existing.processId && portalProcessById(root, existing.processId)) {
      return { ...portalMetadata(root, existing.processId, url), ...existing, url };
    }
    rmSync(pidFile, { force: true });
  }
  if (!(await tcpPortAvailable(port))) {
    throw new Error(`Port ${port} is already in use. Stop the conflicting process or change config/defaults/ports.json.`);
  }
  const child = spawn(process.execPath, [portalServerPath(root), "--usb-root", root, "--port", String(port)], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    windowsHide: true,
  });
  child.unref();
  if (!(await portalReady(url))) {
    if (child.pid && portalProcessById(root, child.pid)) process.kill(child.pid);
    throw new Error(`Portal server did not become reachable at ${url}.`);
  }
  const metadata = portalMetadata(root, child.pid ?? 0, url);
  writeFileSync(pidFile, JSON.stringify(metadata, null, 2), "utf8");
  writeLog(root, "portal", "INFO", `Started portal server on ${url}.`);
  return metadata;
}

export function getPortalStatus(usbRoot: string): ServiceStatus {
  const root = getRoot(usbRoot);
  const pidFile = portalPidFile(root);
  const url = runtimePortalUrl(root);
  let status = "stopped";
  let processId: number | null = null;
  if (existsSync(pidFile)) {
    const metadata = JSON.parse(readFileSync(pidFile, "utf8")) as { processId?: number };
    if (metadata.processId && portalProcessById(root, metadata.processId)) {
      status = "running";
      processId = metadata.processId;
    } else {
      rmSync(pidFile, { force: true });
      status = "stopped";
    }
  }
  return {
    id: "portal",
    displayName: "Portal",
    status,
    pidFile,
    logFile: join(root, "data", "logs", "portal.log"),
    portalUrl: url,
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
  if (stopped) writeLog(root, "portal", "INFO", "Stopped portal server.");
  return stopped;
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
