"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PORTAL_URL = void 0;
exports.generatePortal = generatePortal;
exports.startPortalServer = startPortalServer;
exports.getPortalStatus = getPortalStatus;
exports.stopPortalServer = stopPortalServer;
const node_child_process_1 = require("node:child_process");
const node_net_1 = require("node:net");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_http_1 = require("node:http");
const lifecycle_1 = require("./lifecycle");
const portable_1 = require("./portable");
exports.PORTAL_URL = "http://127.0.0.1:17000/";
function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function generatePortal(usbRoot, services) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const portalPath = (0, node_path_1.join)(root, "portal", "index.html");
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(portalPath), { recursive: true });
    const rows = services.map((service) => {
        const logPath = service.logFile.startsWith(root)
            ? service.logFile.slice(root.length).replace(new RegExp(`^\\${node_path_1.sep}`), "").replaceAll("\\", "/")
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
      <p><strong>Data root:</strong> <code>${escapeHtml((0, node_path_1.join)(root, "data"))}</code></p>
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
    refreshStatus();
    refreshSetupActions();
    refreshBackups();
    refreshAdapterVerification();
    refreshLogs();
    window.setInterval(refreshStatus, 5000);
    window.setInterval(refreshSetupActions, 15000);
    window.setInterval(refreshBackups, 15000);
    window.setInterval(refreshAdapterVerification, 30000);
    window.setInterval(refreshLogs, 15000);
  </script>
</body>
</html>
`;
    (0, node_fs_1.writeFileSync)(portalPath, html, "utf8");
    (0, portable_1.writeLog)(root, "portal", "INFO", "Generated portal/index.html.");
    return { path: portalPath, url: exports.PORTAL_URL };
}
function portalPidFile(usbRoot) {
    return (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "data", "tmp", "pids", "portal.pid");
}
function portalServerPath(usbRoot) {
    return (0, node_path_1.join)((0, portable_1.getRoot)(usbRoot), "core", "node", "dist", "portal-server.js");
}
function portalProcesses(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    try {
        const output = (0, node_child_process_1.execFileSync)("powershell", [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*portal-server.js*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ], { encoding: "utf8" }).trim();
        if (!output)
            return [];
        const parsed = JSON.parse(output);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        return rows.filter((row) => {
            const item = row;
            return (typeof item.ProcessId === "number" &&
                typeof item.CommandLine === "string" &&
                /\bnode(?:\.exe)?\b/i.test(item.CommandLine) &&
                item.CommandLine.includes("portal-server.js") &&
                item.CommandLine.includes(root));
        });
    }
    catch {
        return [];
    }
}
function portalProcessById(usbRoot, pid) {
    return portalProcesses(usbRoot).find((processInfo) => processInfo.ProcessId === pid) ?? null;
}
async function tcpPortAvailable(port) {
    return new Promise((resolveAvailable) => {
        const server = (0, node_net_1.createServer)();
        server.once("error", () => resolveAvailable(false));
        server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailable(true)));
    });
}
async function portalReady(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ready = await new Promise((resolveReady) => {
            const request = (0, node_http_1.get)(exports.PORTAL_URL, (response) => {
                response.resume();
                resolveReady(response.statusCode === 200);
            });
            request.setTimeout(500, () => {
                request.destroy();
                resolveReady(false);
            });
            request.on("error", () => resolveReady(false));
        });
        if (ready)
            return true;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
    }
    return false;
}
function portalMetadata(root, processId) {
    return {
        serviceId: "portal",
        displayName: "Portal",
        status: "running",
        processId,
        startedAt: new Date().toISOString(),
        url: exports.PORTAL_URL,
        logFile: (0, node_path_1.join)(root, "data", "logs", "portal.log"),
    };
}
async function startPortalServer(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const pidFile = portalPidFile(root);
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(pidFile), { recursive: true });
    if ((0, node_fs_1.existsSync)(pidFile)) {
        const existing = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (existing.processId && portalProcessById(root, existing.processId))
            return existing;
        (0, node_fs_1.rmSync)(pidFile, { force: true });
    }
    const existingProcess = portalProcesses(root)[0];
    if (existingProcess) {
        const metadata = portalMetadata(root, existingProcess.ProcessId);
        (0, node_fs_1.writeFileSync)(pidFile, JSON.stringify(metadata, null, 2), "utf8");
        (0, portable_1.writeLog)(root, "portal", "INFO", "Reused existing portal server on http://127.0.0.1:17000/.");
        return metadata;
    }
    if (!(await tcpPortAvailable(17000))) {
        throw new Error("Port 17000 is already in use. Stop the conflicting process or change config/defaults/ports.json.");
    }
    const child = (0, node_child_process_1.spawn)(process.execPath, [portalServerPath(root), "--usb-root", root, "--port", "17000"], {
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
    });
    child.unref();
    if (!(await portalReady())) {
        if (child.pid && portalProcessById(root, child.pid))
            process.kill(child.pid);
        throw new Error("Portal server did not become reachable at http://127.0.0.1:17000/.");
    }
    const metadata = portalMetadata(root, child.pid ?? 0);
    (0, node_fs_1.writeFileSync)(pidFile, JSON.stringify(metadata, null, 2), "utf8");
    (0, portable_1.writeLog)(root, "portal", "INFO", "Started portal server on http://127.0.0.1:17000/.");
    return metadata;
}
function getPortalStatus(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const pidFile = portalPidFile(root);
    let status = "stopped";
    let processId = null;
    if ((0, node_fs_1.existsSync)(pidFile)) {
        const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (metadata.processId && portalProcessById(root, metadata.processId)) {
            status = "running";
            processId = metadata.processId;
        }
        else if (portalProcesses(root).length > 0) {
            status = "running";
            processId = portalProcesses(root)[0]?.ProcessId ?? null;
        }
        else {
            (0, node_fs_1.rmSync)(pidFile, { force: true });
            status = "stopped";
        }
    }
    else if (portalProcesses(root).length > 0) {
        status = "running";
        processId = portalProcesses(root)[0]?.ProcessId ?? null;
    }
    return {
        id: "portal",
        displayName: "Portal",
        status,
        pidFile,
        logFile: (0, node_path_1.join)(root, "data", "logs", "portal.log"),
        portalUrl: exports.PORTAL_URL,
        processId,
        placeholder: false,
        health: {
            type: "http",
            ready: status === "running",
            reason: status === "running" ? "Portal HTTP server is running." : "Portal HTTP server is stopped.",
        },
    };
}
function stopPortalServer(usbRoot) {
    const root = (0, portable_1.getRoot)(usbRoot);
    const pidFile = portalPidFile(root);
    let stopped = false;
    if ((0, node_fs_1.existsSync)(pidFile)) {
        const metadata = JSON.parse((0, node_fs_1.readFileSync)(pidFile, "utf8"));
        if (metadata.processId && portalProcessById(root, metadata.processId)) {
            (0, lifecycle_1.killProcessTree)(metadata.processId);
            stopped = true;
        }
        (0, node_fs_1.rmSync)(pidFile, { force: true });
    }
    for (const processInfo of portalProcesses(root)) {
        try {
            (0, lifecycle_1.killProcessTree)(processInfo.ProcessId);
            stopped = true;
        }
        catch {
            // Already gone.
        }
    }
    if (stopped)
        (0, portable_1.writeLog)(root, "portal", "INFO", "Stopped portal server.");
    return stopped;
}
