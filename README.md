# ClawHermes-USB

ClawHermes-USB is a Windows-first portable runtime suite for running official OpenClaw, Hermes Agent, and EKKOLearnAI/hermes-web-ui from a USB drive.

The project goal is not to fork these upstream tools. It provides a portable launcher, consistent directory layout, data isolation rules, service adapters, backup workflow, and a local portal so users can carry their agent environment between Windows machines with minimal host pollution.

## Current Status

The repository now contains a runnable TypeScript + Node.js orchestration skeleton with small Batch and PowerShell launchers for Windows.

Implemented:

- USB root detection from launcher location.
- Process-local portable environment variables.
- Runtime, path, port, adapter, env-file, and readiness diagnostics.
- Adapter descriptor loading and dependency ordering.
- Placeholder service start/status/stop with logs and PID metadata.
- Managed process launch for production-ready adapters.
- Local portal at `http://127.0.0.1:17000/` with live status and backup visibility.
- Portable backup command that writes timestamped zip archives under `data/backups/`.

Not implemented yet:

- Automatic download, vendoring, or installation of OpenClaw, Hermes Agent, or Hermes Web UI.
- Verified real upstream service integration for OpenClaw and Hermes Agent.

## Quick Start

Install dependencies and build the TypeScript core:

```powershell
npm install
npm run build
```

Run the Windows launchers:

```text
launcher/windows/Setup.bat
launcher/windows/Start.bat
launcher/windows/Status.bat
launcher/windows/Stop.bat
launcher/windows/Backup.bat
```

Run the Node CLI directly:

```powershell
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js wsl --json
node core/node/dist/clawhermes.js adapters --json
node core/node/dist/clawhermes.js adapters hermes-web-ui --json
node core/node/dist/clawhermes.js sources --json
node core/node/dist/clawhermes.js sources hermes-web-ui --json
node core/node/dist/clawhermes.js probe-sources hermes-web-ui --json
node core/node/dist/clawhermes.js checkout-source hermes-web-ui --dry-run --json
node core/node/dist/clawhermes.js setup-adapter hermes-web-ui --dry-run --json
node core/node/dist/clawhermes.js start-adapter hermes-web-ui --dry-run --json
node core/node/dist/clawhermes.js verify-adapter hermes-web-ui --json
node core/node/dist/clawhermes.js mark-adapter-ready hermes-web-ui --confirm-ready --summary "Verified locally" --json
node core/node/dist/clawhermes.js start --json
node core/node/dist/clawhermes.js status --json
node core/node/dist/clawhermes.js logs openclaw --lines 50 --json
node core/node/dist/clawhermes.js backup --dry-run --json
```

Run verification:

```powershell
npm test
```

## Core Documents

- [PRD](docs/PRD.md)
- [Architecture Design](docs/DESIGN.md)
- [Adapter Contract](docs/ADAPTER_CONTRACT.md)
- [Progress Log](docs/PROGRESS.md)

Chinese versions:

- [README.zh-CN.md](README.zh-CN.md)
- [PRD.zh-CN.md](docs/PRD.zh-CN.md)
- [DESIGN.zh-CN.md](docs/DESIGN.zh-CN.md)
- [ADAPTER_CONTRACT.zh-CN.md](docs/ADAPTER_CONTRACT.zh-CN.md)

## Design Goals

- Windows-first portable operation.
- Keep OpenClaw, Hermes Agent, Hermes Web UI, runtime dependencies, sessions, memory, skills, logs, and workspace data on the USB drive.
- Allow small unavoidable host traces, such as browser cache or OS-level recent-file metadata.
- Do not require Docker for the primary path.
- Preserve clear boundaries so future contributors can replace or extend services without rewriting the launcher.

## Top-Level Layout

```text
ClawHermes-USB/
  launcher/   User-facing start, stop, setup, status, and backup scripts.
  core/       Shared TypeScript/Node orchestration logic and Windows dispatcher.
  adapters/   Service-specific integration descriptors and helpers.
  apps/       Upstream application checkouts or installed packages.
  runtimes/   Portable Node.js, Python, Git, and future platform runtimes.
  data/       Portable state, memory, sessions, logs, cache, temp files, and backups.
  portal/     Local unified entry page.
  config/     Defaults, env templates, profiles, and ports.
  scripts/    Setup, diagnostics, backup, and update automation.
  docs/       Product and architecture documentation.
```

Real OpenClaw and Hermes integration will follow after the portable launcher skeleton is verified against the upstream projects.
