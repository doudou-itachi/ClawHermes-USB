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
- Local portal at `http://127.0.0.1:17000/` with live status, setup actions, adapter verification, logs, backup status, and guarded operation commands.
- Portable backup command that writes timestamped zip archives under `data/backups/`.
- Read-only restore planning and guarded no-overwrite restore execution for backup archives.
- Verified WSL2 adapter path for Hermes Agent using the project-managed `ClawHermes-Ubuntu` distro and `http://127.0.0.1:8642/health`.
- Verified WSL2 adapter path for OpenClaw using Node.js 24, pnpm 10.33.2, project-local state/log paths, and `http://127.0.0.1:18789/healthz`.
- Project-local WSL export backups under `data/backups/wsl/`.
- Read-only payload inventory for ignored app checkouts, WSL rootfs archives, and WSL backups.

Not implemented yet:

- Automatic download, vendoring, or installation of OpenClaw, Hermes Agent, or Hermes Web UI.
- One-click packaging of the ignored upstream app payloads and WSL rootfs artifacts.

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

`Start.bat` opens the local portal after a successful start. All Windows Batch launchers forward the core command exit code.

Run the Node CLI directly:

```powershell
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js payloads --json
node core/node/dist/clawhermes.js payload-export --dry-run --json
node core/node/dist/clawhermes.js payload-export --confirm-export --json
node core/node/dist/clawhermes.js wsl --distro Ubuntu --json
node core/node/dist/clawhermes.js prepare-wsl --distro Ubuntu --dry-run --json
node core/node/dist/clawhermes.js wsl-rootfs-guide --distro Ubuntu --json
node core/node/dist/clawhermes.js wsl-import-plan --distro Ubuntu --json
node core/node/dist/clawhermes.js wsl-import --distro Ubuntu --confirm-import --json
node core/node/dist/clawhermes.js wsl-export --distro Ubuntu --confirm-export --json
node core/node/dist/clawhermes.js wsl-unregister-plan --distro Ubuntu --json
node core/node/dist/clawhermes.js wsl-unregister --distro Ubuntu --confirm-unregister --json
node core/node/dist/clawhermes.js wsl-workflow hermes-agent --json
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
node core/node/dist/clawhermes.js restore-plan --archive data/backups/example.zip --json
node core/node/dist/clawhermes.js restore --archive data/backups/example.zip --confirm-restore --json
```

Run verification:

```powershell
npm test
```

WSL2 note: `prepare-wsl` is guarded because enabling WSL2 and registering a Linux distribution modify the current Windows host. The command only prints a plan by default; real host preparation requires `--confirm-install`. WSL2 adapters run in `ClawHermes-Ubuntu`; rootfs/import/export planning uses `Ubuntu` as the source distro. Rootfs archives for `wsl-import-plan` are operator-managed payloads under `runtimes/wsl/`; see [WSL2 Rootfs Artifact Policy](docs/wsl-rootfs-artifacts.md).

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

Real OpenClaw, Hermes Agent, and Hermes Web UI integration paths are now verified. Large upstream checkouts, dependency folders, WSL rootfs archives, and WSL backups remain local ignored payloads rather than source files.
