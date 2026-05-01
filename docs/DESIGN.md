# Architecture Design: ClawHermes-USB

## 1. Design Intent

ClawHermes-USB is designed as a portable orchestration shell around upstream agent tools.

The project must avoid two common failure modes:

1. Becoming a fragile collection of batch scripts.
2. Becoming a fork of OpenClaw, Hermes Agent, or Hermes Web UI.

The design therefore separates generic orchestration from service-specific integration. The core launcher knows how to resolve paths, prepare environment variables, allocate ports, start processes, run health checks, write logs, and stop services. It does not know how OpenClaw internally works. OpenClaw-specific behavior lives in an adapter.

This keeps the system understandable and makes future integrations possible.

## 2. Architectural Layers

```text
User
  |
  v
Launcher Layer
  |
  v
Core Orchestration Layer
  |
  +--> Adapter: OpenClaw
  +--> Adapter: Hermes Agent
  +--> Adapter: Hermes Web UI
  |
  v
Portal Layer
```

### 2.1 Launcher Layer

The launcher layer is the user's direct entry point.

Responsibilities:

- Provide simple platform-specific commands.
- Resolve the project root.
- Set temporary environment variables.
- Invoke core orchestration.
- Avoid business logic where possible.

Windows files:

```text
launcher/windows/Setup.bat
launcher/windows/Start.bat
launcher/windows/Stop.bat
launcher/windows/Status.bat
```

Future macOS files:

```text
launcher/macos/Start.command
launcher/macos/Stop.command
```

The launcher must be thin. If logic grows complex, it belongs in `core/` or `scripts/`.

### 2.2 Core Orchestration Layer

The core layer contains reusable orchestration capabilities.

Planned modules:

```text
core/orchestrator/  Service graph, lifecycle, dependency order.
core/config/        Load config files and merge defaults/profile/env.
core/paths/         Resolve portable paths and normalize separators.
core/process/       Start, stop, monitor, and record child processes.
core/ports/         Check port availability and map services to ports.
core/logging/       Structured log writing.
core/health/        HTTP/TCP/process health checks.
core/backup/        Backup profiles and archive creation.
```

Core rules:

- Do not hardcode OpenClaw/Hermes commands.
- Do not assume fixed drive letters.
- Do not write to host user directories.
- Do not own upstream application code.
- Do consume adapter descriptors.

### 2.3 Adapter Layer

Adapters describe how a service is installed, configured, launched, checked, and shown in the portal.

Initial adapters:

```text
adapters/openclaw/
adapters/hermes-agent/
adapters/hermes-web-ui/
```

Each adapter owns:

- `adapter.json`
- service-specific README
- optional setup scripts
- optional health check helpers
- optional config templates

The adapter interface is documented in [ADAPTER_CONTRACT.md](ADAPTER_CONTRACT.md).

### 2.4 Apps Layer

The `apps/` directory contains upstream applications.

```text
apps/openclaw/
apps/hermes-agent/
apps/hermes-web-ui/
```

Rules:

- Upstream app files should not be mixed with ClawHermes-USB core files.
- Upstream apps should be replaceable.
- Version metadata should be stored separately so updates can be tracked.
- Local patches should be avoided; if required, document them in `docs/decisions/`.

### 2.5 Runtime Layer

The `runtimes/` directory contains portable runtimes.

```text
runtimes/windows/node/
runtimes/windows/python/
runtimes/windows/git/
runtimes/macos/node/
runtimes/macos/python/
runtimes/macos/git/
```

Windows is supported first. macOS directories exist so path conventions are planned from the start.

Runtime rules:

- The launcher prepends portable runtime paths to `PATH`.
- The launcher must not require globally installed Node.js or Python.
- Global package installation is not part of daily startup.
- Caches should point to `data/cache`.

### 2.6 Data Layer

The `data/` directory is the main persistence root.

```text
data/home/
data/openclaw/
data/hermes/
data/hermes-web-ui/
data/shared-workspace/
data/cache/
data/tmp/
data/logs/
data/backups/
```

Design intent:

- `data/home` acts as the portable user home.
- `data/openclaw` stores OpenClaw state.
- `data/hermes` stores `HERMES_HOME`.
- `data/hermes-web-ui` stores EKKO UI state.
- `data/shared-workspace` is visible to both agent systems.
- `data/cache` stores package/runtime caches.
- `data/tmp` stores temporary files and process metadata.
- `data/logs` stores service and launcher logs.
- `data/backups` stores archives.

### 2.7 Portal Layer

The portal is the user's local command center.

Default URL:

```text
http://127.0.0.1:17000/
```

MVP portal responsibilities:

- Show service status.
- Link to OpenClaw Control UI.
- Link to OpenClaw WebChat.
- Link to Hermes Web UI.
- Show project root and data root.
- Show log file locations.
- Provide stop and backup instructions.

The portal does not need to be a heavy frontend initially. A static page served by a small local server is enough for MVP.

## 3. Startup Flow

```text
Start.bat
  |
  +--> Resolve USB root
  +--> Set portable environment variables
  +--> Add portable runtimes to PATH
  +--> Validate directories
  +--> Load services config
  +--> Load adapters
  +--> Check ports
  +--> Start OpenClaw
  +--> Start Hermes Agent gateway
  +--> Start Hermes Web UI
  +--> Start Portal
  +--> Run health checks
  +--> Open browser
```

### 3.1 Root Resolution

The launcher must derive `USB_ROOT` from its own location.

For Windows:

```bat
set SCRIPT_DIR=%~dp0
```

Then resolve upward to the project root.

The launcher must not assume `D:`, `E:`, or any specific drive letter.

### 3.2 Portable Environment

The launcher must set environment variables only for the current process and children.

Required variables:

```bat
set HOME=%USB_ROOT%\data\home
set USERPROFILE=%USB_ROOT%\data\home
set APPDATA=%USB_ROOT%\data\home\AppData\Roaming
set LOCALAPPDATA=%USB_ROOT%\data\home\AppData\Local
set TEMP=%USB_ROOT%\data\tmp
set TMP=%USB_ROOT%\data\tmp
set HERMES_HOME=%USB_ROOT%\data\hermes
set npm_config_cache=%USB_ROOT%\data\cache\npm
set PIP_CACHE_DIR=%USB_ROOT%\data\cache\pip
set UV_CACHE_DIR=%USB_ROOT%\data\cache\uv
```

These redirects are the main mechanism for keeping application state on the USB drive.

### 3.3 Runtime Path

For Windows, the launcher should prepend:

```text
runtimes/windows/node/
runtimes/windows/python/
runtimes/windows/git/
```

to `PATH`.

This lets child processes find the portable runtimes first.

## 4. Service Lifecycle

### 4.1 Service Definition

Services are loaded from adapter descriptors and merged with defaults.

Each service has:

- id
- display name
- runtime type
- working directory
- start command
- environment files
- data directory
- log file
- pid file
- health check
- portal link
- dependencies

### 4.2 Start

Starting a service means:

1. Resolve adapter paths.
2. Resolve environment variables.
3. Validate required runtime.
4. Create required data/log/tmp directories.
5. Spawn process.
6. Write pid metadata.
7. Stream stdout/stderr to log.
8. Wait for health check.

### 4.3 Stop

Stopping a service means:

1. Read pid metadata.
2. Send graceful termination.
3. Wait for timeout.
4. Force terminate if still alive.
5. Mark stopped in metadata.

Stop order should reverse start order.

### 4.4 Status

Status should combine:

- pid file existence
- process alive check
- health endpoint result
- recent log tail

## 5. Configuration Model

Configuration has three layers:

```text
config/defaults/      Project defaults committed to the repository.
config/env/           User-editable env files, examples committed.
config/profiles/      Future profile-specific overrides.
```

Recommended merge order:

1. Built-in defaults.
2. `config/defaults/*.json`.
3. adapter defaults.
4. selected profile.
5. user env files.
6. runtime overrides from launcher.

Secrets should not be committed.

Example files must use `.example` suffix.

## 6. Data Ownership

Data ownership must be explicit.

| Directory | Owner | Purpose |
|---|---|---|
| `data/openclaw` | OpenClaw adapter | OpenClaw state and portable home data. |
| `data/hermes` | Hermes Agent adapter | `HERMES_HOME`, memory, sessions, skills, cron. |
| `data/hermes-web-ui` | Hermes Web UI adapter | UI database, cache, and state. |
| `data/shared-workspace` | User | Files visible to both agent systems. |
| `data/logs` | Core logging | Logs from launcher and services. |
| `data/tmp` | Core process manager | PID files, locks, temporary metadata. |
| `data/backups` | Backup module | Timestamped archives. |

## 7. Host Machine Impact

The design minimizes host impact but does not promise forensic zero-trace behavior.

Allowed host traces:

- Browser profile/cache if the host browser is used.
- Windows recent files metadata.
- Antivirus logs.
- Firewall prompts.
- OS DNS/cache records.

The product must avoid:

- permanent host environment variable changes
- host global npm installs
- host Python package installs
- writing OpenClaw/Hermes state to host home directories
- installing Windows services in MVP daily use

## 8. Error Handling

Error messages should be direct and actionable.

Examples:

- "Portable Node.js not found at runtimes/windows/node/node.exe."
- "Port 8642 is already in use. Stop the conflicting process or change config/defaults/ports.json."
- "Hermes Web UI health check failed after 30 seconds. See data/logs/hermes-web-ui.log."
- "HERMES_HOME is not writable: data/hermes."

The launcher should fail fast when a required dependency is missing.

Partial startup should be handled carefully. If OpenClaw starts but Hermes fails, the status command should show that mixed state and stop should still work.

## 9. Logging Design

All logs go under:

```text
data/logs/
```

Log naming:

```text
launcher.log
openclaw.log
hermes-agent.log
hermes-web-ui.log
portal.log
```

Each log entry should include:

- timestamp
- service id
- level
- message

Plain text is acceptable for MVP. JSON lines may be added later.

## 10. Backup Design

Backups should be profile-based.

### 10.1 Data-Only Backup

Includes:

- `config/`
- `data/openclaw`
- `data/hermes`
- `data/hermes-web-ui`
- `data/shared-workspace`

Excludes:

- `runtimes/`
- `apps/`
- `data/cache`
- `data/tmp`
- large logs unless requested

### 10.2 Full Portable Backup

Includes the full project except disposable temp files.

Use case:

- Move to another USB drive.
- Archive a working environment.

### 10.3 Restore

Restore is intentionally conservative for MVP.

- `restore-plan --archive <zip>` reads `backup-manifest.json` without extracting files.
- `restore --archive <zip> --confirm-restore` is required for execution.
- Restore validates manifest paths and zip entry paths before extraction.
- Restore stages files under `data/tmp/restores/`, copies only manifest-declared entries, and removes staging afterward.
- Existing targets are not overwritten. Conflict resolution is deferred until a separate overwrite policy exists.

## 11. macOS Expansion Strategy

macOS should be treated as a platform adapter, not a redesign.

Future additions:

```text
launcher/macos/Start.command
launcher/macos/Stop.command
runtimes/macos/node/
runtimes/macos/python/
runtimes/macos/git/
scripts/setup/macos/
```

Cross-platform requirements:

- Adapter descriptors use relative paths.
- Core path logic normalizes separators.
- Config files avoid Windows-only syntax.
- Platform-specific commands are isolated.

Known macOS differences:

- executable permissions
- app quarantine attributes
- shell behavior
- PTY behavior
- Python packaging differences
- browser opening command

## 12. Security Model

MVP security posture:

- Bind local services to `127.0.0.1`.
- Keep secrets in uncommitted env files.
- Avoid logging full tokens.
- Avoid public network exposure.
- Avoid privilege escalation.

The project is not a sandbox. OpenClaw and Hermes can execute tools with the permissions granted by their configuration and the host OS.

## 13. Development Conventions

Future contributors should follow these rules:

- Put orchestration logic in `core/`.
- Put service-specific behavior in `adapters/`.
- Put third-party application files in `apps/`.
- Put portable runtime binaries in `runtimes/`.
- Put generated data in `data/`.
- Do not hardcode drive letters.
- Do not write secrets to committed files.
- Document significant architectural choices in `docs/decisions/`.

## 14. Initial Implementation Plan

The recommended implementation order is:

1. Create launcher scripts that only print resolved paths and env.
2. Add config loading and validation.
3. Add adapter descriptor validation.
4. Add process manager for simple placeholder commands.
5. Add portal placeholder.
6. Add health checks.
7. Integrate Hermes Agent.
8. Integrate Hermes Web UI.
9. Integrate OpenClaw.
10. Add backup and diagnostics.

This order reduces risk because the portable shell can be verified before upstream integrations are introduced.
