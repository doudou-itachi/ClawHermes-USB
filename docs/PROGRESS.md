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

### Local Runtime Archive Installation

Status: `Done`

Summary:

- Added `install-runtime <name> --archive <zip>` to install a runtime from a local archive.
- Added `--dry-run` support for previewing the extraction target and expected executables.
- The command strips a single top-level directory from zip archives before copying into the manifest install directory.
- Added tests for dry-run output and local archive extraction.
- Kept runtime installation explicit and offline; the command does not download binaries.

Changed areas:

- `core/node/src/`
- `core/node/dist/`
- `core/windows/clawhermes.ps1`
- `docs/windows-runtime.md`
- `docs/windows-runtime.zh-CN.md`
- `docs/PROGRESS.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_install_runtime_dry_run_reports_archive_plan -v`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_install_runtime_extracts_local_archive_and_setup_detects_it -v`

Next steps:

- Add checksum metadata support before automated downloads are considered.
- Extend archive install tests for Python and Git package layouts.

### Runtime Archive Checksum Verification

Status: `Done`

Summary:

- Added `--sha256 <expected-sha256>` support to `install-runtime`.
- The command now computes the local archive SHA256 before dry-run or extraction.
- A mismatch fails fast before writing to runtime directories.
- Added regression tests for matching and mismatching checksums.
- Updated runtime documentation with checksum usage examples.

Changed areas:

- `core/node/src/`
- `core/node/dist/`
- `docs/windows-runtime.md`
- `docs/windows-runtime.zh-CN.md`
- `docs/PROGRESS.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_install_runtime_can_verify_explicit_sha256 tests.test_windows_core.WindowsCoreTests.test_install_runtime_rejects_wrong_sha256 -v`

Next steps:

- Add manifest-level checksum fields once exact runtime versions are pinned.
- Extend archive installation layout tests for Python embeddable and Git Portable packages.

### Setup Port Diagnostics

Status: `Done`

Summary:

- Added setup diagnostics for default TCP ports from `config/defaults/ports.json`.
- Setup JSON now includes a `ports` array with name, host, port, and availability.
- Occupied ports add actionable messages to setup output.
- Added regression tests for available and occupied portal port checks.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_default_port_diagnostics tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_occupied_port -v`

Next steps:

- Add directory/app/config validation to setup so first-time setup explains every missing project requirement in one pass.

### Setup Path Diagnostics

Status: `Done`

Summary:

- Added required path diagnostics to setup JSON.
- Setup now reports key directories and config files with path, type, required flag, and existence.
- Missing required paths add actionable setup messages.
- Added test coverage for app directories, config files, data directories, and portal directory.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_required_paths -v`

Next steps:

- Add setup diagnostics for user env files versus committed `.env.example` templates.

### Setup Env Template Diagnostics

Status: `Done`

Summary:

- Added setup diagnostics for adapter-declared env files.
- Setup JSON now includes `envFiles` with service id, env path, existence, example path, and example existence.
- Missing env files now generate actionable messages that tell users which `.env.example` file to copy.
- Added regression coverage for Hermes Agent, Hermes Web UI, and OpenClaw env templates.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_env_template_diagnostics -v`

Next steps:

- Add optional helper command to create local env files from examples without overwriting existing secrets.

### Env Initialization Command

Status: `Done`

Summary:

- Added a safe `init-env` command to create adapter-declared local env files from committed `.env.example` templates.
- Existing env files are skipped so local secrets are not overwritten.
- `--dry-run` reports the env files that would be created without writing them.
- The PowerShell dispatcher remains a thin wrapper and only adds `init-env` to the allowed action set.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/src/clawhermes.ts`
- `core/node/dist/`
- `core/windows/clawhermes.ps1`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-04-30-init-env.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_init_env_json_creates_missing_env_files_without_overwriting_existing_values tests.test_windows_core.WindowsCoreTests.test_init_env_dry_run_reports_missing_env_files_without_writing -v`

Next steps:

- Load adapter env files into the portable service environment before replacing placeholders with real upstream process launches.

### Service Environment Resolution

Status: `Done`

Summary:

- Added `.env` parsing for adapter-declared env files.
- Merged portable defaults, env file variables, and adapter inline variables into an internal per-service environment.
- Added a redacted `service-env` diagnostic command that reports loaded env files and variable names without printing secret values.
- Placeholder `start` metadata now records env file status and variable names, but not variable values.
- Added regression coverage for secret redaction, unknown service errors, and placeholder metadata environment summaries.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/src/clawhermes.ts`
- `core/node/dist/`
- `core/windows/clawhermes.ps1`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-04-30-service-env.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata tests.test_windows_core.WindowsCoreTests.test_service_env_json_reports_loaded_variables_without_secret_values tests.test_windows_core.WindowsCoreTests.test_service_env_unknown_service_fails_with_actionable_message -v`

Next steps:

- Replace placeholder service metadata writes with real supervised process launch for services whose adapters have verified native Windows commands.

### Managed Process Launch Scaffold

Status: `Done`

Summary:

- Added a real managed process launch path for adapters whose `integration.productionReady` flag is true and that define a start command.
- Existing OpenClaw, Hermes Agent, and Hermes Web UI adapters remain in placeholder mode because their native Windows integration is not production-ready.
- Managed process metadata records pid, command, working directory, and redacted environment summary.
- `stop` now kills managed adapter process trees before removing pid metadata.
- Added a temporary fake adapter integration test that verifies env file values reach the child process without being written to pid metadata.

Changed areas:

- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-04-30-managed-process-launch.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata -v`

Next steps:

- Add process-aware status cleanup for managed adapter pid files so stale or exited child processes are reported accurately.

### Managed Status Cleanup

Status: `Done`

Summary:

- `status` now checks whether non-placeholder managed adapter processes still exist.
- Stale managed pid files are removed and the service is reported as `stopped`.
- Placeholder services keep their existing metadata-based behavior.
- Added regression coverage for stale managed pid cleanup alongside managed process and placeholder status paths.

Changed areas:

- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-04-30-managed-status-cleanup.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_status_removes_stale_managed_adapter_pid_file tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata -v`

Next steps:

- Add a structured service health summary so `status` can report process metadata, portal URL, and health-check readiness in one JSON shape.

### Structured Status Health

Status: `Done`

Summary:

- Enriched `status -Json` service entries with `processId`, `placeholder`, and structured `health` fields.
- Placeholder services now report health as not ready even when placeholder metadata exists.
- Managed process services report process health as ready when the recorded process is running.
- Portal status now includes HTTP health readiness and process metadata.
- Existing status and portal fields remain compatible.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-04-30-structured-status-health.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it -v`

Next steps:

- Add lightweight health-check execution for HTTP adapters so status can distinguish process running from endpoint ready.

### HTTP Health Checks

Status: `Done`

Summary:

- Added lightweight HTTP health probing for adapters with `health.type = "http"`.
- `status -Json` now reports HTTP `url`, `statusCode`, readiness, and reason for HTTP adapters.
- HTTP adapters only report ready when the endpoint returns a 2xx or 3xx response.
- Existing process and placeholder health behavior remains unchanged.
- Added regression coverage for reachable and unreachable HTTP health endpoints.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/types.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-http-health-checks.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_status_reports_http_adapter_ready_when_endpoint_responds tests.test_windows_core.WindowsCoreTests.test_status_reports_http_adapter_not_ready_when_endpoint_is_unreachable -v`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it tests.test_windows_core.WindowsCoreTests.test_status_removes_stale_managed_adapter_pid_file -v`

Next steps:

- Surface health readiness in the generated portal so users can see stopped, placeholder, process-running, and endpoint-ready states at a glance.

### Portal Health Summary

Status: `Done`

Summary:

- Added a `Health` column to the generated portal service table.
- Portal rows now show Ready/Not ready, health type, and health reason.
- Placeholder services visibly report not-ready health in the portal instead of appearing equivalent to managed running services.
- Existing portal generation and localhost serving behavior remains intact.

Changed areas:

- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-portal-health-summary.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_generates_portal_from_adapter_metadata tests.test_windows_core.WindowsCoreTests.test_start_serves_portal_over_localhost_and_stop_shuts_it_down -v`

Next steps:

- Add a machine-readable status snapshot file under `data/tmp/status.json` so external tools and future portal refresh logic can reuse the latest status without rerunning all probes.

### Status Snapshot

Status: `Done`

Summary:

- Added `generatedAt` to `status` payloads.
- `status` now writes the latest status payload to `data/tmp/status.json`.
- The snapshot includes service health fields for external tooling and future portal refresh logic.
- Existing JSON output remains compatible while gaining the timestamp field.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/clawhermes.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-status-snapshot.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata -v`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_status_removes_stale_managed_adapter_pid_file tests.test_windows_core.WindowsCoreTests.test_status_reports_http_adapter_ready_when_endpoint_responds tests.test_windows_core.WindowsCoreTests.test_status_reports_http_adapter_not_ready_when_endpoint_is_unreachable tests.test_windows_core.WindowsCoreTests.test_start_serves_portal_over_localhost_and_stop_shuts_it_down -v`

Next steps:

- Add a `refresh-status` portal endpoint or lightweight status file serving path so the portal can update health without regenerating the full HTML.

### Portal Status Endpoint

Status: `Done`

Summary:

- `start` now writes an initial `data/tmp/status.json` snapshot after the portal process is running.
- The portal server now serves `/status.json` from the status snapshot.
- `/status.json` uses JSON content type and `no-store` cache control for refresh-friendly reads.
- Portal HTML serving and lifecycle behavior remain intact.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/portal-server.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-portal-status-endpoint.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_serves_portal_over_localhost_and_stop_shuts_it_down tests.test_windows_core.WindowsCoreTests.test_start_generates_portal_from_adapter_metadata -v`

Next steps:

- Add a small portal-side refresh script that fetches `/status.json` and updates health cells without reloading the page.

### Portal Refresh Script

Status: `Done`

Summary:

- Added stable `data-service-id` and cell markers to generated portal service rows.
- Added a small inline refresh script that fetches `/status.json` and updates status and health cells.
- The portal remains static and dependency-free while gaining refresh-ready behavior.
- Existing portal generation and localhost lifecycle tests remain green.

Changed areas:

- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-portal-refresh-script.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_generates_portal_from_adapter_metadata tests.test_windows_core.WindowsCoreTests.test_start_serves_portal_over_localhost_and_stop_shuts_it_down -v`

Next steps:

- Add log tail helpers so portal/status output can point users to the newest launcher and service log snippets without opening files manually.

### Log Tail Helper

Status: `Done`

Summary:

- Added a controlled `logs` CLI action for recent log lines.
- Log targets are constrained to `launcher` or known adapter service IDs.
- `--lines` is supported and capped to avoid large reads.
- The PowerShell dispatcher remains thin and only adds `logs` to the allowed action list.
- Added regression coverage for known service logs and unknown target rejection.

Changed areas:

- `core/node/src/core.ts`
- `core/node/src/clawhermes.ts`
- `core/node/dist/`
- `core/windows/clawhermes.ps1`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-log-tail-helper.md`
- `tests/test_windows_core.py`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_logs_json_tails_known_service_log tests.test_windows_core.WindowsCoreTests.test_logs_unknown_target_fails_with_actionable_message -v`
- `powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 logs launcher --lines 1 -UsbRoot . -Json`

Next steps:

- Split the growing TypeScript core into smaller modules once the current orchestration behavior stabilizes.

### Portable Utilities Split

Status: `Done`

Summary:

- Extracted portable root resolution, relative path resolution, process-local environment construction, data writability checks, and launcher log writing into `core/node/src/portable.ts`.
- `core.ts` now imports these shared helpers and re-exports public helpers used by the CLI.
- This is the first low-risk step toward splitting the growing TypeScript core into smaller modules.
- Behavior is unchanged; existing CLI actions continue to use the same public core exports.

Changed areas:

- `core/node/src/portable.ts`
- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-portable-utils.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_env_json_resolves_root_and_portable_environment tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_runtime_diagnostics_and_valid_adapters tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata tests.test_windows_core.WindowsCoreTests.test_logs_json_tails_known_service_log -v`

Next steps:

- Split adapter loading, validation, readiness, and service ordering into an adapter-focused TypeScript module.

### Adapter Utilities Split

Status: `Done`

Summary:

- Extracted adapter discovery, adapter validation, integration readiness, and service ordering into `core/node/src/adapters.ts`.
- `core.ts` now imports adapter helpers and re-exports the public helper functions for compatibility.
- This continues the staged decomposition of the TypeScript core while preserving CLI behavior.

Changed areas:

- `core/node/src/adapters.ts`
- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-adapter-utils.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_runtime_diagnostics_and_valid_adapters tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_adapter_integration_readiness tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it -v`

Next steps:

- Split runtime manifest diagnostics and runtime archive installation into a runtime-focused TypeScript module.

### Runtime Utilities Split

Status: `Done`

Summary:

- Extracted runtime manifest loading, runtime diagnostics, preparation planning, SHA256 verification, and archive extraction into `core/node/src/runtimes.ts`.
- `core.ts` now imports runtime helpers and re-exports the public runtime functions for compatibility.
- Runtime installation behavior remains unchanged while the main core module becomes smaller.

Changed areas:

- `core/node/src/runtimes.ts`
- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-runtime-utils.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_runtime_diagnostics_and_valid_adapters tests.test_windows_core.WindowsCoreTests.test_runtimes_json_outputs_preparation_steps_from_manifest tests.test_windows_core.WindowsCoreTests.test_install_runtime_dry_run_reports_archive_plan tests.test_windows_core.WindowsCoreTests.test_install_runtime_extracts_local_archive_and_setup_detects_it tests.test_windows_core.WindowsCoreTests.test_install_runtime_can_verify_explicit_sha256 tests.test_windows_core.WindowsCoreTests.test_install_runtime_rejects_wrong_sha256 -v`

Next steps:

- Split environment file diagnostics, initialization, and service environment resolution into an environment-focused TypeScript module.

### Environment Utilities Split

Status: `Done`

Summary:

- Extracted adapter env file diagnostics, safe env initialization, `.env` parsing, service environment resolution, and redacted service environment diagnostics into `core/node/src/environment.ts`.
- `core.ts` now imports environment helpers and re-exports public functions for compatibility.
- Managed process environment injection and CLI env commands remain unchanged while the core module shrinks further.

Changed areas:

- `core/node/src/environment.ts`
- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-environment-utils.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_env_template_diagnostics tests.test_windows_core.WindowsCoreTests.test_init_env_json_creates_missing_env_files_without_overwriting_existing_values tests.test_windows_core.WindowsCoreTests.test_init_env_dry_run_reports_missing_env_files_without_writing tests.test_windows_core.WindowsCoreTests.test_service_env_json_reports_loaded_variables_without_secret_values tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it -v`

Next steps:

- Split status, health, and snapshot helpers into a status-focused TypeScript module.

### Status Helpers Split

Status: `Done`

Summary:

- Extracted adapter health evaluation, HTTP health probing, process existence checks, and status snapshot writing into `core/node/src/status.ts`.
- Kept `getStatus` in `core.ts` for now because it still composes adapter status with portal process status.
- `core.ts` now imports status helpers and re-exports `writeStatusSnapshot` for CLI compatibility.
- Status JSON, snapshots, stale PID cleanup, process health, and HTTP health behavior remain unchanged.

Changed areas:

- `core/node/src/status.ts`
- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-status-helpers.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata tests.test_windows_core.WindowsCoreTests.test_status_removes_stale_managed_adapter_pid_file tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it tests.test_windows_core.WindowsCoreTests.test_status_reports_http_adapter_ready_when_endpoint_responds tests.test_windows_core.WindowsCoreTests.test_status_reports_http_adapter_not_ready_when_endpoint_is_unreachable -v`

Next steps:

- Split portal generation and portal process management into a portal-focused TypeScript module.

### Portal Utilities Split

Status: `Done`

Summary:

- Extracted portal HTML generation, portal process discovery, portal start/stop, and portal status helpers into `core/node/src/portal.ts`.
- `core.ts` now imports portal helpers and passes current service status into portal generation to avoid a circular dependency.
- Public portal exports remain available through the core module for CLI and test compatibility.

Changed areas:

- `core/node/src/portal.ts`
- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-portal-utils.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_generates_portal_from_adapter_metadata tests.test_windows_core.WindowsCoreTests.test_start_serves_portal_over_localhost_and_stop_shuts_it_down tests.test_windows_core.WindowsCoreTests.test_status_removes_portal_pid_when_process_is_not_portal_server tests.test_windows_core.WindowsCoreTests.test_start_fails_when_portal_port_is_occupied_by_another_process -v`

Next steps:

- Split setup diagnostics, path checks, port checks, and log tail helpers into a diagnostics-focused TypeScript module.

### Diagnostics Utilities Split

Status: `Done`

Summary:

- Extracted setup diagnostics aggregation, required path checks, port availability checks, and controlled log tail reading into `core/node/src/diagnostics.ts`.
- `core.ts` now imports `setupDiagnostics` for startup preflight reporting and re-exports diagnostics helpers for CLI compatibility.
- Setup JSON and logs JSON behavior remain unchanged while the main core module is reduced to lifecycle orchestration.

Changed areas:

- `core/node/src/diagnostics.ts`
- `core/node/src/core.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-diagnostics-utils.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_runtime_diagnostics_and_valid_adapters tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_default_port_diagnostics tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_occupied_port tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_required_paths tests.test_windows_core.WindowsCoreTests.test_logs_json_tails_known_service_log tests.test_windows_core.WindowsCoreTests.test_logs_unknown_target_fails_with_actionable_message -v`

Next steps:

- Split managed adapter process launch and stop helpers into a lifecycle-focused TypeScript module.

### Lifecycle Utilities Split

Status: `Done`

Summary:

- Extracted adapter start metadata creation, managed process launch, placeholder start logging, adapter stop handling, and process tree termination into `core/node/src/lifecycle.ts`.
- `core.ts` now delegates adapter start/stop details while keeping high-level start/status/stop orchestration.
- `portal.ts` now uses the shared process tree termination helper for portal shutdown.

Changed areas:

- `core/node/src/lifecycle.ts`
- `core/node/src/core.ts`
- `core/node/src/portal.ts`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-split-lifecycle-utils.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_start_status_stop_manage_placeholder_pid_metadata tests.test_windows_core.WindowsCoreTests.test_start_runs_production_ready_adapter_process_and_stop_kills_it tests.test_windows_core.WindowsCoreTests.test_status_removes_stale_managed_adapter_pid_file tests.test_windows_core.WindowsCoreTests.test_start_serves_portal_over_localhost_and_stop_shuts_it_down -v`

Next steps:

- Review the smaller TypeScript core for remaining production gaps and prioritize the next functional improvement over further mechanical splitting.

### Backup Command

Status: `Done`

Summary:

- Added a `backup` CLI action with `data-only` and `full` profiles, `--include-logs`, and `--dry-run`.
- Implemented timestamped zip archive creation under `data/backups/` with a generated `backup-manifest.json`.
- Added `launcher/windows/Backup.bat` and allowed `backup` through the PowerShell dispatcher.
- Covered dry-run planning and data-only archive contents with integration tests.

Changed areas:

- `core/node/src/backup.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `launcher/windows/Backup.bat`
- `tests/test_windows_core.py`
- `core/node/dist/`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-backup-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_backup_dry_run_reports_data_only_entries_without_archive tests.test_windows_core.WindowsCoreTests.test_backup_json_creates_data_only_archive -v`

Next steps:

- Add portal-facing backup visibility or a richer backup status/action surface after the command-line workflow is stable.

### Portal Backup Status

Status: `Done`

Summary:

- Added a read-only `/backups.json` endpoint to the portal server.
- The endpoint lists zip archives under `data/backups/` and reports the latest backup archive.
- Updated the generated portal operations section to point to `launcher/windows/Backup.bat` and show latest backup status.
- Added an integration test that creates a backup, starts the portal, and verifies the portal backup endpoint.

Changed areas:

- `core/node/src/portal-server.ts`
- `core/node/src/portal.ts`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-portal-backup-status.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_portal_serves_backup_status -v`

Next steps:

- Update user-facing README status and command documentation so the implemented TypeScript/Node workflow is discoverable.

### README Status Refresh

Status: `Done`

Summary:

- Updated the English README to describe the implemented TypeScript/Node core, Windows launcher scripts, backup command, portal status, and test workflow.
- Rewrote the Chinese README as readable UTF-8 text, replacing the previous mojibake content.
- Clarified that real upstream OpenClaw and Hermes integration is still pending.

Changed areas:

- `README.md`
- `README.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-update-readme-status.md`

Validation performed:

- Markdown review
- `git diff --check`
- UTF-8 smoke check

Next steps:

- Continue toward real upstream adapter integration by improving adapter setup guidance and runtime readiness messages.

### Setup Recommended Actions

Status: `Done`

Summary:

- Added structured `actions` to setup diagnostics while preserving the existing `messages` array.
- Runtime, adapter readiness, missing env file, port, path, and data writability issues now include next-step guidance.
- Non-JSON setup output prints a `Recommended actions` section with commands and documentation links where available.
- Added regression coverage for setup JSON actions and text output.

Changed areas:

- `core/node/src/diagnostics.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/types.ts`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-setup-actions.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_json_reports_recommended_actions tests.test_windows_core.WindowsCoreTests.test_setup_text_prints_recommended_actions -v`

Next steps:

- Surface setup recommended actions in the portal so users can see startup blockers without opening JSON output.

### Portal Setup Actions

Status: `Done`

Summary:

- `start` now writes setup diagnostics to `data/tmp/setup.json` before launching the portal.
- The portal server exposes the setup snapshot through a read-only `/setup.json` endpoint.
- The generated portal page renders a `Setup actions` section so runtime, env file, and adapter readiness guidance is visible without opening JSON output.
- Added integration coverage for the setup snapshot and portal endpoint.

Changed areas:

- `core/node/src/diagnostics.ts`
- `core/node/src/core.ts`
- `core/node/src/portal-server.ts`
- `core/node/src/portal.ts`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-portal-setup-actions.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_portal_serves_setup_actions_snapshot -v`

Next steps:

- Add adapter-focused CLI guidance for setup commands and app directory preparation before attempting real upstream integration.

### Adapter Guidance Command

Status: `Done`

Summary:

- Added an `adapters` CLI action that reports adapter preparation status for all services or one service id.
- Adapter guidance includes app directory presence, data directory presence, runtime metadata, env file status, setup/start/stop commands, dependencies, integration readiness, portal metadata, and next steps.
- PowerShell dispatcher now accepts the `adapters` action.
- Added regression coverage for all-adapter output, single-adapter filtering, and unknown adapter errors.

Changed areas:

- `core/node/src/adapter-guidance.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-adapter-guidance-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_adapters_json_reports_preparation_plan tests.test_windows_core.WindowsCoreTests.test_adapters_json_can_filter_one_adapter tests.test_windows_core.WindowsCoreTests.test_adapters_unknown_service_fails_with_actionable_message -v`

Next steps:

- Add documentation for the new `adapters` command in README and adapter contract guidance.

### Adapter Guidance Documentation

Status: `Done`

Summary:

- Added `adapters --json` and single-adapter command examples to the English and Chinese README files.
- Documented the adapter preparation command in the English and Chinese adapter contract docs.
- Updated contributor workflow guidance to run the adapter guidance command before marking real integration ready.

Changed areas:

- `README.md`
- `README.zh-CN.md`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-document-adapter-guidance-command.md`

Validation performed:

- Markdown review
- `git diff --check`
- UTF-8 smoke check
- Chinese README and adapter contract mojibake scans

Next steps:

- Start turning adapter guidance into real upstream integration preparation by adding explicit app checkout/install source metadata.

### Adapter Upstream Metadata

Status: `Done`

Summary:

- Added explicit `upstream` metadata to the default OpenClaw, Hermes Agent, and Hermes Web UI adapter descriptors.
- Added TypeScript schema support for repository URL, install docs, checkout ref, install mode, and integration notes.
- Adapter guidance now reports `upstream` metadata and distinguishes `appDirExists` from `appDirReady` so placeholder-only app directories are visible.
- Updated English and Chinese adapter contract docs with the new field.

Changed areas:

- `adapters/*/adapter.json`
- `core/node/src/types.ts`
- `core/node/src/adapter-guidance.ts`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-adapter-upstream-metadata.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_adapters_json_reports_upstream_source_metadata -v`

Next steps:

- Add a safe app-source preparation plan command that can show checkout targets without mutating `apps/`.

### Source Plan Command

Status: `Done`

Summary:

- Added a read-only `sources` CLI action that reports upstream checkout targets for all adapters or one adapter id.
- Source plans include target app directory path, app directory readiness, upstream metadata, checkout command, and `wouldModify: false`.
- PowerShell dispatcher now accepts the `sources` action.
- Added regression coverage for all-source output, single-adapter filtering, and unknown adapter errors.

Changed areas:

- `core/node/src/adapter-guidance.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-source-plan-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_sources_json_reports_checkout_targets_without_mutation tests.test_windows_core.WindowsCoreTests.test_sources_json_can_filter_one_adapter tests.test_windows_core.WindowsCoreTests.test_sources_unknown_service_fails_with_actionable_message -v`

Next steps:

- Document the `sources` command and then consider a gated, explicit checkout helper once the user opts into network mutations.

### Source Plan Documentation

Status: `Done`

Summary:

- Added `sources --json` and single-adapter examples to the English and Chinese README files.
- Documented the read-only source plan command in the English and Chinese adapter contract.
- Updated the contributor workflow to run both adapter guidance and source planning before real integration work.

Changed areas:

- `README.md`
- `README.zh-CN.md`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-document-source-plan-command.md`

Validation performed:

- Markdown review
- `git diff --check`
- UTF-8 smoke check
- Chinese README and adapter contract mojibake scans

Next steps:

- Consider a gated, explicit checkout helper that refuses to mutate `apps/` unless the operator passes a deliberate opt-in flag.

### Guarded Checkout Source Command

Status: `Done`

Summary:

- Added `checkout-source <service-id>` for one-adapter upstream checkout.
- The command supports `--dry-run` with `wouldModify: false`.
- Real checkout refuses to run unless `--confirm-checkout` is passed.
- Real checkout refuses app directories that already contain real content and removes only `.gitkeep` placeholders before cloning.
- Added tests using a local Git repository fixture so checkout behavior is verified without depending on external network access.
- Documented the command in the English and Chinese README files and adapter contract.

Changed areas:

- `core/node/src/adapter-guidance.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `README.md`
- `README.zh-CN.md`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-checkout-source-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_checkout_source_requires_explicit_confirmation tests.test_windows_core.WindowsCoreTests.test_checkout_source_dry_run_does_not_modify_app_dir tests.test_windows_core.WindowsCoreTests.test_checkout_source_confirm_clones_placeholder_app_dir -v`
- `npm test`
- `git diff --check`
- UTF-8 smoke check
- Chinese README and adapter contract mojibake scans

Next steps:

- Add install/setup execution planning after source checkout so adapter setup commands can be run with the same dry-run and explicit-confirmation pattern.

### Guarded Setup Adapter Command

Status: `Done`

Summary:

- Added `setup-adapter <service-id>` for one-adapter setup command execution.
- The command supports `--dry-run` with `wouldModify: false`.
- Real setup refuses to run unless `--confirm-setup` is passed.
- Setup runs from the adapter `appDir` with the resolved service environment.
- JSON output reports env file diagnostics and variable names without exposing secret values.
- Added tests for confirmation gating, dry-run safety, and confirmed setup execution using a local fake adapter.
- Documented the command in the English and Chinese README files and adapter contract.

Changed areas:

- `core/node/src/adapter-setup.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `README.md`
- `README.zh-CN.md`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-setup-adapter-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_setup_adapter_requires_explicit_confirmation tests.test_windows_core.WindowsCoreTests.test_setup_adapter_dry_run_reports_command_without_running tests.test_windows_core.WindowsCoreTests.test_setup_adapter_confirm_runs_adapter_setup_command -v`
- `npm test`
- `git diff --check`
- UTF-8 smoke check
- Chinese README and adapter contract mojibake scans

Next steps:

- Add a guarded adapter verification command that checks setup output, start command readiness, and health endpoint behavior before any adapter can be marked production-ready.

### Adapter Verification Command

Status: `Done`

Summary:

- Added read-only `verify-adapter <service-id>` for one-adapter production-readiness evidence.
- The verifier reports `productionReadyCandidate` plus checks for app directory readiness, setup command, setup output log, start command, env files, health declaration, and health behavior.
- Verification output avoids secret values by listing env file diagnostics and variable names only.
- Added tests for missing setup evidence, passing verification after confirmed setup for a process adapter, and unknown adapter errors.
- Documented the command in the English and Chinese README files and adapter contract.

Changed areas:

- `core/node/src/adapter-verification.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `README.md`
- `README.zh-CN.md`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-verify-adapter-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_verify_adapter_reports_missing_setup_output tests.test_windows_core.WindowsCoreTests.test_verify_adapter_passes_after_confirmed_setup_for_process_adapter tests.test_windows_core.WindowsCoreTests.test_verify_adapter_unknown_service_fails_with_actionable_message -v`
- `npm test`
- `git diff --check`
- UTF-8 smoke check
- Chinese README and adapter contract mojibake scans

Next steps:

- Add an explicit metadata update command for adapter integration status that requires verifier evidence instead of editing production-ready fields by hand.

### Adapter Readiness Metadata Command

Status: `Done`

Summary:

- Added guarded `mark-adapter-ready <service-id>` for updating adapter integration metadata.
- The command requires `--confirm-ready` and a non-empty `--summary`.
- The command reruns `verify-adapter` and refuses to write metadata unless `productionReadyCandidate` is true.
- Successful updates set `integration.status: verified`, `integration.productionReady: true`, `integration.verifiedAt` to the current date, and `integration.summary` to the provided evidence summary.
- Added tests for confirmation gating, verifier gating, and successful metadata update in a temporary adapter root.
- Documented the command in the English and Chinese README files and adapter contract.

Changed areas:

- `core/node/src/adapter-metadata.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `README.md`
- `README.zh-CN.md`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-mark-adapter-ready-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_mark_adapter_ready_requires_explicit_confirmation tests.test_windows_core.WindowsCoreTests.test_mark_adapter_ready_rejects_failed_verification tests.test_windows_core.WindowsCoreTests.test_mark_adapter_ready_updates_integration_metadata_after_verification -v`
- `npm test`
- `git diff --check`
- UTF-8 smoke check
- Chinese README and adapter contract mojibake scans

Next steps:

- Start exercising the guarded checkout/setup/verify/mark workflow against real upstream repositories in a disposable local clone before enabling any default adapter as production-ready.

### Source Probe Command

Status: `Done`

Summary:

- Added read-only `probe-sources [service-id]` for checking upstream repository reachability and checkout ref availability.
- The command runs `git ls-remote` and reports `wouldModify: false`.
- Source probe output includes reachability, ref presence, exit code, and concise operator messages.
- Added tests with a local Git repository fixture for reachable refs, missing refs, and unknown adapter errors without depending on external network access.
- Documented the command in the English and Chinese README files and adapter contract.

Changed areas:

- `core/node/src/adapter-guidance.ts`
- `core/node/src/clawhermes.ts`
- `core/node/src/core.ts`
- `core/windows/clawhermes.ps1`
- `core/node/dist/`
- `tests/test_windows_core.py`
- `README.md`
- `README.zh-CN.md`
- `docs/ADAPTER_CONTRACT.md`
- `docs/ADAPTER_CONTRACT.zh-CN.md`
- `docs/PROGRESS.md`
- `docs/superpowers/plans/2026-05-01-add-probe-sources-command.md`

Validation performed:

- `npm run build`
- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_probe_sources_json_reports_reachable_upstream_ref_without_mutation tests.test_windows_core.WindowsCoreTests.test_probe_sources_json_reports_missing_ref tests.test_windows_core.WindowsCoreTests.test_probe_sources_unknown_service_fails_with_actionable_message -v`
- `npm test`
- `git diff --check`
- UTF-8 smoke check
- Chinese README and adapter contract mojibake scans

Next steps:

- Run `probe-sources --json` against the real default upstream repositories and record the observed repository/ref status before any checkout attempt.
