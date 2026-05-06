# Native PyQt Control Design

## Goal

ClawHermes-USB should run OpenClaw, Hermes Agent, and Hermes Web UI directly on Windows without requiring WSL for the primary path. A PyQt executable should act as the user-facing control panel. When the executable opens, it starts or reuses a local control service, then talks to that service to start, stop, inspect, configure, and troubleshoot the managed services.

## Scope

This design covers the first native Windows implementation slice:

- Replace the default OpenClaw and Hermes Agent adapter metadata with Windows-native runtime declarations.
- Add a local HTTP control service under `127.0.0.1` for PyQt and future UI clients.
- Add a PyQt launcher/control-panel scaffold that can discover the USB root, start the control service, and call its APIs.
- Keep existing Node orchestration as the source of truth for lifecycle, status, model configuration, logs, and setup checks.

This design does not vendor or download upstream OpenClaw/Hermes payloads automatically. Operators still prepare `apps/` and `runtimes/` payloads explicitly.

## Architecture

The PyQt executable is a thin client. It should not know service-specific startup commands or configuration file formats. It locates the USB root, starts the Node control service if needed, reads the assigned local URL, and sends HTTP requests.

The Node control service is the stable local API boundary:

```text
PyQt EXE
  -> http://127.0.0.1:<assigned-control-port>/api/*
    -> core/node orchestration
      -> adapters/openclaw
      -> adapters/hermes-agent
      -> adapters/hermes-web-ui
```

The existing CLI remains available for scripts and tests. The control service reuses existing core functions rather than duplicating process management.

## Reference: vh-claw

The `uxiaohan/vh-claw` project was reviewed as a reference at Git commit `6719096af358daa9aed2f4d8b1c8d27bc0978ad4`. It is MIT licensed and uses Electrobun, Bun, and Vue for a portable OpenClaw desktop manager.

Useful ideas to adopt:

- Keep the desktop UI thin and delegate runtime work to a backend manager.
- Resolve the portable root from the executable location, while allowing an explicit override during development.
- Keep user data and OpenClaw configuration in project-local portable directories.
- Start OpenClaw as a managed child process and poll the local HTTP endpoint until it is ready.
- Push or poll status changes so the UI can show `uninitialized`, `starting`, `running`, and `stopped`.
- Provide model configuration through structured backend calls instead of asking the UI to edit config files directly.

Ideas not adopted for this project:

- The project will stay on the existing TypeScript/Node orchestration core rather than switching to Bun/Electrobun.
- Runtime downloads remain guarded/operator-managed for now; automatic internet installation is not part of this first slice.
- Service-specific shims from `vh-claw` will not be copied. If OpenClaw on Windows needs shims, they should be reimplemented in our adapter/core boundary with tests.

## Native Adapter Strategy

OpenClaw should declare a Windows Node runtime:

- `runtime.kind`: `node`
- `runtime.platform`: `windows`
- `runtime.requiredExecutable`: `node.exe`
- setup uses `corepack` and `pnpm` in the app directory
- start uses the OpenClaw gateway command on Windows
- stop uses generic PID-based stop unless a native stop command is later verified

Hermes Agent should declare a Windows Python runtime:

- `runtime.kind`: `python`
- `runtime.platform`: `windows`
- `runtime.requiredExecutable`: `python.exe`
- setup creates or reuses a local `.venv` under `apps/hermes-agent`
- start runs the Hermes gateway through the Windows venv
- stop uses generic PID-based stop unless a native stop command is later verified

`integration.platform` and `integration.strategy` should describe the new native path. Production readiness should be marked as candidate until verified with real upstream payloads on Windows.

## Control Service API

Initial API surface:

```text
GET  /api/health
GET  /api/status
POST /api/services/start
POST /api/services/stop
POST /api/services/:id/start
POST /api/services/:id/stop
GET  /api/model-config
POST /api/model-config
GET  /api/logs?service=<id>&lines=<n>
GET  /api/install/status
POST /api/install/run
POST /api/shutdown
```

Responses are JSON and should include enough detail for a GUI to show useful feedback without scraping console text.

## Status Detection

Status should be layered:

1. PID metadata exists.
2. Managed process still exists.
3. Port or HTTP health endpoint responds.
4. Service API responds where an API is available.
5. Model configuration exists and is redacted in user-facing responses.

The current `status` command already implements PID and HTTP health checks. The control service should expose the same status object through `/api/status`.

## PyQt Control Panel

The PyQt scaffold should:

- Resolve the USB root from the executable/script location or an explicit `CLAWHERMES_USB_ROOT`.
- Start the local control service through the project dispatcher when it is not reachable.
- Read `data/tmp/control-server.json` for the assigned port.
- Poll `/api/status` on a timer.
- Provide controls for start, stop, model configuration status, logs, and install status.
- Call `/api/shutdown` when the window exits by default.

The first implementation may be a simple functional desktop UI. Richer visual polish can follow after the native service path is working.

## Error Handling

The control service should return structured error responses:

```json
{
  "error": {
    "message": "Adapter hermes-agent has no start command.",
    "code": "operation_failed"
  }
}
```

Mutating actions should be explicit HTTP POST operations. GET endpoints should be read-only.

## Testing

Tests should cover:

- OpenClaw and Hermes Agent adapters report Windows-native runtimes instead of WSL2.
- Setup diagnostics no longer require WSL actions when default adapters are native.
- The control server starts on localhost, writes `data/tmp/control-server.json`, serves `/api/health`, `/api/status`, `/api/install/status`, `/api/model-config`, `/api/logs`, and stops via `/api/shutdown`.
- The PyQt scaffold contains USB-root discovery, control-server bootstrap, status polling, and shutdown hooks.

## Delivery Notes

The executable packaging path should be documented but does not need to produce a binary in this first source-code change. Recommended packaging remains PyInstaller once the control panel script is stable.
