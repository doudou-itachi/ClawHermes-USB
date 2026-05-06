# ClawHermes-USB

ClawHermes-USB is a Windows-first portable runtime suite for running [OpenClaw](https://github.com/openclaw/openclaw), [Hermes Agent](https://github.com/NousResearch/hermes-agent), and [EKKOLearnAI/hermes-web-ui](https://github.com/EKKOLearnAI/hermes-web-ui) from a USB drive.

![ClawHermes-USB portable runtime overview](docs/assets/hero.svg)

The project goal is not to fork these upstream tools. It provides a portable launcher, consistent directory layout, data isolation rules, service adapters, backup workflow, and a local portal so users can carry their agent environment between Windows machines with minimal host pollution.

Development note: this project was developed with assistance from [Superpowers](https://github.com/obra/superpowers), the OpenAI ChatGPT 5.5 model, and OpenAI Codex.

## Current Status

The repository now contains a runnable TypeScript + Node.js orchestration skeleton with small Batch and PowerShell launchers for Windows.

Implemented:

- USB root detection from launcher location.
- Process-local portable environment variables.
- Runtime, path, port, adapter, env-file, and readiness diagnostics.
- Read-only setup wizard that orders diagnostics, runtime preparation, env files, optional WSL2 workflows, payload packaging, adapter setup, verification, backup, and release steps.
- Adapter descriptor loading and dependency ordering.
- Placeholder service start/status/stop with logs and PID metadata.
- Managed process launch for production-ready adapters.
- Local portal at `http://127.0.0.1:17000/` by default with live status, setup actions, adapter verification, logs, backup status, and guarded operation commands.
- Runtime port remapping when default service or portal ports are already occupied; assignments are written to `data/tmp/ports.json`.
- Unified local gateway/auth token defaults set to `clawhermes` for OpenClaw, Hermes Agent, and Hermes Web UI.
- Portable backup command that writes timestamped zip archives under `data/backups/`.
- Read-only restore planning and guarded no-overwrite restore execution for backup archives.
- Windows-native verified adapter path for Hermes Agent using a project-local Python virtual environment and `http://127.0.0.1:8642/health`.
- Windows-native verified adapter path for OpenClaw using Node.js, pnpm, project-local state/log paths, and `http://127.0.0.1:18789/healthz`.
- Local control service for desktop clients at `127.0.0.1` with JSON APIs for status, install diagnostics, logs, model configuration, service start/stop, and shutdown.
- PyQt control panel scaffold under `launcher/pyqt/` that starts or reuses the local control service when opened.
- Optional WSL2 diagnostics, import/export, and unregister workflows remain available for adapters or operators that still need WSL.
- Project-local WSL export backups under `data/backups/wsl/`.
- Read-only payload inventory for ignored app checkouts, WSL rootfs archives, and WSL backups.

Not implemented yet:

- Automatic download, vendoring, or installation of OpenClaw, Hermes Agent, or Hermes Web UI.
- One-click packaging of the ignored upstream app payloads and optional WSL rootfs artifacts.
- Final PyInstaller-built `ClawHermes-Control.exe` binary in source control; build it from `launcher/pyqt/build.ps1` when packaging a release.

## Quick Start

Install dependencies and build the TypeScript core:

```powershell
npm install
npm run build
```

Run the Windows launchers:

```text
launcher/windows/ClawHermes-Control.bat
launcher/windows/ClawHermes-Control.vbs
launcher/windows/Setup.bat
launcher/windows/Start.bat
launcher/windows/Status.bat
launcher/windows/Stop.bat
launcher/windows/Backup.bat
```

For non-technical USB users, the recommended entry is `launcher/windows/ClawHermes-Control.vbs` because it opens the GUI without a console window. `launcher/windows/ClawHermes-Control.bat` remains as a compatibility launcher and delegates to the same VBS entry. The GUI control center opens as a single Windows window with left-side navigation for installation, service start/stop, OpenClaw Chat, Hermes Web UI, model configuration, logs, backup, repair/update, and light/dark/system theme switching. The GUI stores its preference in `data\settings\gui.json` and runs status/log/config commands asynchronously so the window remains responsive.

The new PyQt control panel source lives under `launcher/pyqt/`. It starts a localhost control service on open, then communicates through `/api/status`, `/api/services/*`, `/api/model-config`, and `/api/logs`. Build the executable with:

```powershell
launcher/pyqt/build.ps1
```

Model configuration in the GUI asks for API URL / Base URL, model name, API key, and whether to apply the settings to OpenClaw, Hermes, or both. The shared core command stores the redacted user-facing status under `data/settings/model-config.json`, writes OpenClaw settings under `data/openclaw/openclaw.json`, and writes Hermes settings under `data/hermes/`.

The numbered double-click launchers remain available as fallback actions when the GUI is unavailable.

Normal use:

```text
launcher/windows/1-Install-ClawHermes.bat
launcher/windows/2-Start-ClawHermes.bat
launcher/windows/3-Stop-ClawHermes.bat
launcher/windows/4-Status-ClawHermes.bat
launcher/windows/5-Backup-ClawHermes.bat
```

Advanced maintenance only:

```text
launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat
launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat
```

`6-Uninstall-Host-WSL-ClawHermes.bat` is not part of normal use. It removes the managed WSL distro from the current Windows host after backup and explicit confirmation. `Tools-Repair-Or-Update-ClawHermes.bat` is for advanced maintenance and may require network access.

The normal release path is offline-first: prepare portable runtimes and app payloads before handing the USB drive to a user. Prepare WSL artifacts only when you intentionally ship a WSL-based adapter path.

`Start.bat` opens the local portal after a successful start. If port `17000` is occupied, the core selects a free local port and `Start.bat` opens the assigned URL from `data/tmp/ports.json`. All Windows Batch launchers forward the core command exit code.

Run the Node CLI directly:

```powershell
node core/node/dist/clawhermes.js setup --json
node core/node/dist/clawhermes.js setup-wizard --json
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
node core/node/dist/clawhermes.js control-server --port 0 --json
node core/node/dist/clawhermes.js control-server-stop --json
node core/node/dist/clawhermes.js status --json
node core/node/dist/clawhermes.js logs openclaw --lines 50 --json
node core/node/dist/clawhermes.js model-config --provider-type openai-compatible --api-url https://api.example.com/v1 --model demo-model --api-key sk-example --apply both --json
node core/node/dist/clawhermes.js model-config-status --json
node core/node/dist/clawhermes.js backup --dry-run --json
node core/node/dist/clawhermes.js restore-plan --archive data/backups/example.zip --json
node core/node/dist/clawhermes.js restore --archive data/backups/example.zip --confirm-restore --json
```

Run verification:

```powershell
npm test
```

WSL2 note: WSL2 is no longer required for the default OpenClaw and Hermes Agent adapter metadata, but the guarded WSL workflow remains available. `prepare-wsl` is guarded because enabling WSL2 and registering a Linux distribution modify the current Windows host. The command only prints a plan by default; real host preparation requires `--confirm-install`. WSL2 adapters run in `ClawHermes-Ubuntu`; rootfs/import/export planning uses `Ubuntu` as the source distro. Rootfs archives for `wsl-import-plan` are operator-managed payloads under `runtimes/wsl/`; see [WSL2 Rootfs Artifact Policy](docs/wsl-rootfs-artifacts.md).

Local auth note: the default portable env templates set OpenClaw gateway token, Hermes Agent API server key, and Hermes Web UI auth token to `clawhermes`. Change `config/env/*.env` before sharing a running instance beyond trusted localhost use.

## Core Documents

- [PRD](docs/PRD.md)
- [Architecture Design](docs/DESIGN.md)
- [Adapter Contract](docs/ADAPTER_CONTRACT.md)
- [Progress Log](docs/PROGRESS.md)
- [Release Checklist](docs/release-checklist.md)

Chinese versions:

- [README.zh-CN.md](README.zh-CN.md)
- [Developer Local Runbook.zh-CN](docs/developer-local-runbook.zh-CN.md)
- [USB Deployment Guide.zh-CN](docs/usb-deployment.zh-CN.md)
- [PRD.zh-CN.md](docs/PRD.zh-CN.md)
- [DESIGN.zh-CN.md](docs/DESIGN.zh-CN.md)
- [ADAPTER_CONTRACT.zh-CN.md](docs/ADAPTER_CONTRACT.zh-CN.md)

## Design Goals

![ClawHermes-USB runtime architecture](docs/assets/runtime-architecture.svg)

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

OpenClaw and Hermes Agent now default to Windows-native verified adapters; Hermes Web UI remains a verified Windows Node adapter. The current local verification used OpenClaw `82c4fd8f56751faa03470e32f4763b7245c69b71` and Hermes Agent `f27fcb6a82b8487174ca941c15e7a5887371eede`. Large upstream checkouts, dependency folders, optional WSL rootfs archives, and WSL backups remain local ignored payloads rather than source files.
