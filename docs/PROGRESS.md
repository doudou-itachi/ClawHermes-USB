# Project Progress

This document tracks meaningful progress for ClawHermes-USB.

Update it whenever a milestone is completed, changed, blocked, or deferred.

## Status Legend

- `Done`: Completed and validated.
- `In progress`: Actively being worked on.
- `Blocked`: Waiting on external information or action.
- `Deferred`: Intentionally postponed.

## 2026-04-30

### Initial Project Foundation

Status: `Done`

Summary:

- Created the ClawHermes-USB project directory.
- Established a maintainable project structure for launchers, core orchestration, adapters, upstream apps, portable runtimes, data, portal, config, scripts, and docs.
- Added detailed English and Chinese documentation.
- Added adapter descriptors for OpenClaw, Hermes Agent, and Hermes Web UI.
- Added initial Windows and macOS launcher placeholders.
- Added `AGENT.md` with project-level coding-agent rules.
- Initialized git, created the initial bilingual commit, connected the GitHub remote, and pushed `main`.

Changed areas:

- `README.md`
- `README.zh-CN.md`
- `docs/`
- `adapters/`
- `config/`
- `launcher/`
- `core/`
- `portal/`
- `apps/`
- `runtimes/`
- `data/`
- `AGENT.md`

Validation performed:

- JSON configuration and adapter files were parsed successfully.
- Git repository was initialized on `main`.
- Initial commit was pushed to `origin/main`.
- Local `HEAD` matched `origin/main`.

Next steps:

- Implement Windows launcher path resolution and environment validation.
- Add adapter validation tooling.
- Add a minimal local portal server.
- Verify official startup requirements for OpenClaw, Hermes Agent, and EKKOLearnAI/hermes-web-ui.

### First Runnable Skeleton

Status: `Done`

Summary:

- Added a Windows PowerShell core module and dispatcher under `core/windows/`.
- Replaced Windows launcher placeholders with thin wrappers around the dispatcher.
- Implemented root resolution, portable environment generation, runtime diagnostics, adapter validation, placeholder start/status/stop metadata, launcher logging, and generated portal HTML.
- Added Python `unittest` coverage for the Windows core behavior.

Changed areas:

- `core/windows/`
- `launcher/windows/`
- `tests/`
- `portal/README.md`
- `docs/superpowers/`
- `.gitignore`

Validation performed:

- `python -m unittest tests.test_windows_core -v`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 setup -UsbRoot .`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 start -UsbRoot .`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 status -UsbRoot .`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 stop -UsbRoot .`

Next steps:

- Add real process spawning after portable runtime payloads and upstream app install paths are available.
- Verify current official startup requirements for OpenClaw, Hermes Agent, and EKKOLearnAI/hermes-web-ui before enabling production service commands.

### Local Portal Server

Status: `Done`

Summary:

- Added a PowerShell portal server bound to `http://127.0.0.1:17000/`.
- Added portal process metadata under `data/tmp/pids/portal.pid`.
- Updated start/status/stop lifecycle so portal is started, reported, and stopped with the rest of the skeleton.
- Added stale PID and orphan portal process handling so repeated starts do not leave the port stuck.
- Added safeguards so portal PID metadata is trusted only when the live process matches this repository's `portal-server.ps1`.
- Added startup confirmation so `start` fails when port `17000` is occupied by another process or the portal does not become reachable.
- Added HTTP-level test coverage for portal availability and shutdown.

Changed areas:

- `core/windows/ClawHermes.Core.psm1`
- `core/windows/portal-server.ps1`
- `tests/test_windows_core.py`
- `docs/superpowers/plans/2026-04-30-portal-server.md`

Validation performed:

- `python -m unittest tests.test_windows_core -v`
- regression coverage for occupied portal port and invalid portal PID metadata
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 setup -UsbRoot .`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 start -UsbRoot .`
- `Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:17000/' -TimeoutSec 5`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 status -UsbRoot .`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 stop -UsbRoot .`

Next steps:

- Keep portal implementation intentionally small until real service status and log viewing are wired in.
