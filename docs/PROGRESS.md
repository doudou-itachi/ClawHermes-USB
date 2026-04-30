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

### Upstream Integration Readiness

Status: `Done`

Summary:

- Verified current upstream startup guidance before enabling real adapter commands.
- Added `docs/upstream-integration.md` with conservative integration conclusions and source links.
- Added machine-readable `integration` metadata to OpenClaw, Hermes Agent, and Hermes Web UI adapter descriptors.
- Updated setup diagnostics to report adapter integration readiness alongside runtime and adapter validation.
- Updated adapter READMEs with the 2026-04-30 upstream check.

Changed areas:

- `adapters/openclaw/`
- `adapters/hermes-agent/`
- `adapters/hermes-web-ui/`
- `core/windows/ClawHermes.Core.psm1`
- `docs/upstream-integration.md`
- `tests/test_windows_core.py`

Validation performed:

- `python -m unittest tests.test_windows_core -v`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 setup -UsbRoot . -Json`

Next steps:

- Decide the portable runtime acquisition strategy for Node.js, Python, and Git.
- Verify installed upstream payloads locally before marking any adapter `productionReady: true`.
- Prefer foreground commands for services managed by ClawHermes-USB; avoid upstream service installers for portable daily startup.

### TypeScript Core Migration

Status: `Done`

Summary:

- Migrated the service-agnostic orchestration core from PowerShell module logic to TypeScript + Node.js.
- Added `package.json`, `package-lock.json`, `tsconfig.json`, TypeScript source under `core/node/src/`, and built JavaScript under `core/node/dist/`.
- Kept `core/windows/clawhermes.ps1` as a thin PowerShell wrapper that resolves portable or development Node.js and forwards commands to the Node CLI.
- Replaced the PowerShell portal server with a Node HTTP server.
- Updated behavior tests to exercise the Node CLI directly while command-level verification still covers the PowerShell wrapper and Batch-facing path.
- Added the user's autonomous-progress rule to `AGENT.md`.

Changed areas:

- `core/node/`
- `core/windows/clawhermes.ps1`
- `core/README.md`
- `tests/test_windows_core.py`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `AGENT.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core -v`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 setup -UsbRoot .`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 start -UsbRoot .`
- `Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:17000/' -TimeoutSec 5`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 status -UsbRoot .`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 stop -UsbRoot .`

Next steps:

- Keep Batch and PowerShell launchers thin.
- Move future orchestration features into `core/node/src/`.
- Add focused TypeScript unit tests as the core grows beyond the current command-level behavior suite.

### Runtime Manifest Diagnostics

Status: `Done`

Summary:

- Added `config/defaults/runtimes.json` as the source of truth for Windows runtime validation.
- Recorded official source URLs and package types for Node.js, Python, and Git.
- Updated TypeScript setup diagnostics to read candidate executable paths from the manifest.
- Expanded runtime tests to verify source URLs, package types, version policies, and candidate paths.
- Updated English and Chinese Windows runtime documentation.
- Rewrote `docs/windows-runtime.zh-CN.md` as readable UTF-8 Chinese text.

Changed areas:

- `config/defaults/runtimes.json`
- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/dist/`
- `docs/windows-runtime.md`
- `docs/windows-runtime.zh-CN.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_runtime_diagnostics_and_valid_adapters -v`

Next steps:

- Add an explicit setup command for copying or unpacking runtime payloads into the expected directories.
- Keep runtime binaries ignored by git and outside normal source commits.

### Runtime Preparation Command

Status: `Done`

Summary:

- Added a `runtimes` CLI action to the TypeScript core.
- The command reads `config/defaults/runtimes.json` and outputs download/extract guidance without downloading binaries.
- The PowerShell wrapper now forwards the `runtimes` action.
- Added JSON test coverage for runtime preparation steps.
- Updated runtime documentation with human-readable and JSON command examples.

Changed areas:

- `core/node/src/`
- `core/node/dist/`
- `core/windows/clawhermes.ps1`
- `core/README.md`
- `docs/windows-runtime.md`
- `docs/windows-runtime.zh-CN.md`
- `docs/PROGRESS.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_runtimes_json_outputs_preparation_steps_from_manifest -v`

Next steps:

- Add a setup subcommand that validates a supplied local archive path and unpacks it into the manifest install directory.
- Keep daily startup free of silent downloads.
