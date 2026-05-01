# PRD: ClawHermes-USB

## 1. Product Summary

ClawHermes-USB is a portable Windows-first agent suite that runs official OpenClaw, Hermes Agent, and EKKOLearnAI/hermes-web-ui from a USB drive.

The product gives users a single removable workspace that contains the agent runtimes, application code, configuration, sessions, memory, skills, logs, and shared working files. A user should be able to plug the USB drive into a compatible Windows machine, run one launcher, and access both OpenClaw and Hermes web experiences through a local browser.

The project should be designed as a maintainable software product rather than a collection of scripts. Its structure must make it easy for future developers to understand service boundaries, add new integrations, change launch behavior, support macOS later, and debug failures.

## 2. Problem Statement

OpenClaw and Hermes Agent are powerful self-hosted agent systems, but their normal setup assumes a machine-specific installation. They may write to user home directories, require runtime dependencies, open local ports, store sessions and memory on the host, and need manual startup steps.

For users who want to carry their agent environment between machines, this creates several problems:

- Configuration and memory do not naturally travel with the user.
- Host machines accumulate application data, caches, and partial installs.
- Reproducing the same OpenClaw/Hermes setup on another machine takes time.
- Running both systems side by side requires remembering ports, startup order, and service health.
- Ad hoc scripts become hard for other developers to maintain.

ClawHermes-USB solves this by providing a portable folder layout, runtime boundary, data redirection strategy, service adapter model, and local control portal.

## 3. Goals

### 3.1 User Goals

- Run OpenClaw and Hermes from a USB drive on Windows.
- Keep core agent data on the USB drive.
- Launch both ecosystems from one entry point.
- Access OpenClaw Control UI/WebChat and Hermes Web UI from a local portal.
- Move to another compatible Windows machine with minimal reconfiguration.
- Back up the full portable agent environment from one folder.

### 3.2 Developer Goals

- Keep the project readable and modular.
- Separate generic orchestration from service-specific behavior.
- Make each integration replaceable through adapters.
- Avoid hardcoded drive letters and absolute user paths.
- Make logs and diagnostics easy to find.
- Leave a clear path for future macOS support.

### 3.3 Product Goals

- Windows-first MVP.
- No Docker requirement for the primary path.
- Use official OpenClaw and EKKOLearnAI/hermes-web-ui rather than forks.
- Use Hermes Agent as the Hermes runtime.
- Keep host-machine disk usage minimal and non-essential.
- Provide an architecture that can later support additional tools such as Open WebUI, LobeChat, or alternate Hermes dashboards.

## 4. Non-Goals

The MVP will not:

- Guarantee zero traces on the host machine.
- Bundle large local LLM model weights.
- Provide full offline model inference.
- Support Linux/macOS in the first release.
- Modify OpenClaw, Hermes Agent, or Hermes Web UI source code unless an adapter workaround is unavoidable.
- Replace the upstream tools' own configuration systems.
- Act as a security sandbox for arbitrary tool execution.
- Provide enterprise multi-user access control in the MVP.

## 5. Target Users

### 5.1 Primary User

A technical user who wants a portable personal agent environment and is comfortable running a local launcher on Windows.

Typical needs:

- Move between multiple Windows computers.
- Keep agent memory, sessions, and skills portable.
- Experiment with both OpenClaw and Hermes.
- Avoid installing a full stack on each host machine.

### 5.2 Secondary User

A developer who wants to extend the project.

Typical needs:

- Add another agent frontend.
- Replace the portal implementation.
- Add macOS support.
- Improve diagnostics.
- Add update or backup workflows.

## 6. Core User Scenarios

### 6.1 First-Time Setup

The user downloads or builds ClawHermes-USB into a USB drive folder.

The user runs `launcher/windows/Setup.bat`.

The setup process checks:

- Portable Node.js runtime.
- Portable Python runtime.
- Optional portable Git.
- Required directory structure.
- Required application folders.
- Initial config templates.

If dependencies are missing, setup explains what is missing and where it should be placed or downloaded in a later automated setup phase.

### 6.2 Daily Start

The user plugs in the USB drive and runs `launcher/windows/Start.bat`.

The launcher:

1. Detects the project root.
2. Sets portable environment variables for the current process tree.
3. Loads service definitions.
4. Checks port availability.
5. Starts OpenClaw.
6. Starts Hermes Agent gateway.
7. Starts Hermes Web UI.
8. Starts the local portal.
9. Opens `http://127.0.0.1:17000/`.

The portal shows service status and links to:

- OpenClaw Control UI.
- OpenClaw WebChat.
- Hermes Web UI.
- Logs.
- Backup and stop actions.

### 6.3 Stop Services

The user runs `launcher/windows/Stop.bat` or clicks a portal stop action.

The system:

- Reads process IDs from `data/tmp/pids`.
- Attempts graceful shutdown.
- Forces shutdown only after timeout.
- Writes shutdown logs.
- Leaves user data intact.

### 6.4 Move to Another Machine

The user safely stops services, ejects the USB drive, plugs it into another compatible Windows host, and runs `Start.bat`.

The system should not depend on the previous drive letter. It recalculates all paths from the launcher location.

### 6.5 Backup

The user runs a backup command.

The system creates a timestamped archive under `data/backups/` containing:

- `config/`
- selected `data/`
- adapter metadata
- service version metadata

Runtime binaries and application checkouts may be excluded or included based on backup profile.

## 7. Functional Requirements

### 7.1 Portable Root Detection

- The launcher must discover the project root relative to the script path.
- The launcher must not rely on a fixed drive letter.
- All generated absolute paths must derive from the project root.

### 7.2 Environment Redirection

The launcher must set process-local environment variables so child processes write to the USB data directory where possible.

Required Windows variables:

- `HOME`
- `USERPROFILE`
- `APPDATA`
- `LOCALAPPDATA`
- `TEMP`
- `TMP`
- `HERMES_HOME`
- `npm_config_cache`
- `PIP_CACHE_DIR`
- `UV_CACHE_DIR`

These variables must be scoped to the launched processes and must not permanently modify the host system environment.

### 7.3 Service Adapter Loading

Each service must define an adapter descriptor that includes:

- service id
- display name
- service type
- app directory
- runtime requirement
- start command
- environment files
- data directory
- health check
- portal link
- dependency ordering

Core orchestration must consume this descriptor instead of hardcoding service behavior.

### 7.4 Port Management

- Default ports must live in `config/defaults/ports.json`.
- The launcher must detect occupied ports before starting services.
- The MVP may fail fast with a clear error.
- A later release may support automatic port remapping.

Initial reserved ports:

- Portal: `17000`
- OpenClaw gateway/control/webchat: to be confirmed from official runtime behavior.
- Hermes Agent API/gateway: `8642` by default.
- Hermes Web UI: `8648` based on EKKOLearnAI/hermes-web-ui docs.

### 7.5 Logging

All launcher and service logs must be written under:

```text
data/logs/
```

Minimum log files:

- `launcher.log`
- `openclaw.log`
- `hermes-agent.log`
- `hermes-web-ui.log`
- `portal.log`

Logs should include timestamps, service id, event type, and exit status where possible.

### 7.6 Process Management

The launcher must record process metadata under:

```text
data/tmp/pids/
```

Each service should have:

- pid file
- start timestamp
- command summary
- resolved working directory
- log path

### 7.7 Health Checks

Each adapter must define a health check.

Supported MVP health check types:

- HTTP GET URL
- TCP port open
- process alive

The portal should show service status based on health checks.

### 7.8 Portal

The portal must provide:

- service status
- service links
- visible project root
- visible data root
- log links or log viewer
- stop instructions
- backup instructions

The MVP portal can be static with a small local server. Later versions can become a richer UI.

### 7.9 Data Persistence

The system must treat `data/` as the main persistence root.

Required directories:

- `data/openclaw`
- `data/hermes`
- `data/hermes-web-ui`
- `data/shared-workspace`
- `data/home`
- `data/cache`
- `data/tmp`
- `data/logs`
- `data/backups`

### 7.10 Setup Validation

Setup must validate:

- directory structure
- runtime directories
- app directories
- adapter descriptors
- config files
- writable `data/`
- port availability

Setup must produce actionable messages rather than failing silently.

## 8. Non-Functional Requirements

### 8.1 Maintainability

- Project structure must communicate ownership.
- Third-party app code must stay under `apps/`.
- Portable runtime binaries must stay under `runtimes/`.
- User data must stay under `data/`.
- Our own orchestration code must stay under `core/`, `launcher/`, `portal/`, `scripts/`, and `docs/`.

### 8.2 Extensibility

Adding a new service should require:

1. Creating `adapters/<service>/adapter.json`.
2. Adding optional service scripts.
3. Adding config templates.
4. Adding a portal entry.

It should not require editing unrelated service logic.

### 8.3 Portability

- Windows is the first supported platform.
- Future macOS support should reuse the same config, adapter, apps, and data layout where possible.
- Platform-specific launchers must live under `launcher/<platform>/`.

### 8.4 Host Impact

The product should minimize host writes.

Allowed host traces:

- Browser cache and history if using the host browser.
- OS-level recent file metadata.
- Antivirus scan metadata.
- Temporary process artifacts outside project control.

Not allowed by design:

- Permanent global npm installs.
- Permanent Python packages in host Python.
- OpenClaw/Hermes state under the host user profile.
- System service installation in MVP daily start.

### 8.5 Security

- Secrets should live in `config/env/*.env` or service-supported secret files under `data/`.
- Example env files must never include real credentials.
- Logs should avoid printing full API keys.
- Portal should bind to `127.0.0.1` by default.
- Public network exposure is out of scope for MVP.

### 8.6 Reliability

- Start should be idempotent where possible.
- Stop should tolerate already-stopped services.
- Logs should remain available after failures.
- Health check failures should show the specific failing service.

## 9. MVP Scope

The first buildable milestone includes:

- Directory structure.
- PRD and design docs.
- Adapter contract docs.
- Example adapter descriptors.
- Windows launcher placeholders.
- Config templates.
- Basic portal placeholder.

The second milestone includes:

- Real Windows environment bootstrap.
- Runtime validation.
- Process start/stop implementation.
- Local portal server.
- Basic health checks.

The third milestone includes:

- Official OpenClaw integration.
- Hermes Agent integration.
- EKKOLearnAI/hermes-web-ui integration.
- Backup workflow.

## 10. Acceptance Criteria

MVP documentation acceptance:

- A new developer can identify where launchers, adapters, apps, runtimes, configs, and data live.
- A new developer can understand why `core/` must not contain service-specific details.
- A new developer can write a new adapter from `docs/ADAPTER_CONTRACT.md`.
- The PRD clearly states what is in scope and out of scope.

First runnable acceptance:

- Running `Start.bat` from any drive letter resolves the correct project root.
- Services are started with data paths pointing at the project `data/` directory.
- Logs are written under `data/logs`.
- Portal opens at `127.0.0.1`.
- `Stop.bat` shuts down launched services.

Integration acceptance:

- OpenClaw launches using official code/package.
- Hermes Agent launches with `HERMES_HOME` under `data/hermes`.
- Hermes Web UI launches and connects to Hermes Agent.
- User sessions and memory remain available after moving the folder to a different drive letter.

## 11. Risks

### 11.1 Upstream Path Assumptions

OpenClaw or Hermes may assume host home directories. Mitigation: set process-local home variables and document any unavoidable writes.

### 11.2 Windows Native Module Compatibility

Node packages using PTY or native modules may depend on Windows build tools or architecture. Mitigation: prefer prebuilt packages where available and document runtime constraints.

### 11.3 USB Performance

Slow USB drives may affect dependency loading, logs, SQLite databases, and package caches. Mitigation: recommend USB 3.x SSD-grade storage for serious use.

### 11.4 Antivirus Interference

Portable runtimes and local servers may trigger antivirus scanning. Mitigation: clear logs and signed/known runtimes where possible.

### 11.5 Port Conflicts

Host machines may already use required ports. Mitigation: detect conflicts before startup; later add automatic remapping.

## 12. Resolved Decisions and Remaining Open Questions

Resolved MVP decisions:

- The first runnable version relies on the host browser. A portable browser profile is deferred.
- Backups are profile-based: `data-only` is the default and excludes `runtimes/` and `apps/`; `full` includes the portable project except disposable temp/cache state.
- The MVP portal is generated by the core and served by a tiny local Node server bound to `127.0.0.1`.
- Backup restore is guarded: `restore-plan` is read-only, `restore` requires `--confirm-restore`, and existing targets are not overwritten.

Remaining open questions:

- Which exact official OpenClaw startup mode best supports portable data paths on Windows?
- Does OpenClaw expose environment variables for home/data/cache paths, or must the launcher rely on `HOME`/`USERPROFILE` redirection?
