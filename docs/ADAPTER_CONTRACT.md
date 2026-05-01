# Adapter Contract

## 1. Purpose

Adapters are the boundary between ClawHermes-USB core orchestration and external services.

The core should know how to start a service from a descriptor. It should not know the internal details of OpenClaw, Hermes Agent, Hermes Web UI, or any future integration.

Each adapter answers these questions:

- What is this service called?
- Where is the app installed?
- Which portable runtime does it need?
- Which command starts it?
- Which env files configure it?
- Where should its data live?
- How do we know it is healthy?
- Which URL should the portal show?
- Which other services must start first?

## 2. Required Files

Each adapter directory should contain:

```text
adapters/<service-id>/
  adapter.json
  README.md
```

Optional files:

```text
  setup.ps1
  start.ps1
  stop.ps1
  health.ps1
  templates/
```

Optional scripts exist for services that need custom behavior beyond the generic process manager.

## 3. Descriptor Schema

Example:

```json
{
  "id": "hermes-web-ui",
  "displayName": "Hermes Web UI",
  "description": "EKKOLearnAI Hermes Web UI dashboard.",
  "type": "node-service",
  "enabled": true,
  "appDir": "apps/hermes-web-ui",
  "runtime": {
    "kind": "node",
    "platform": "windows",
    "requiredExecutable": "node.exe"
  },
  "upstream": {
    "name": "EKKOLearnAI/hermes-web-ui",
    "repositoryUrl": "https://github.com/EKKOLearnAI/hermes-web-ui",
    "installDocs": "https://github.com/EKKOLearnAI/hermes-web-ui",
    "checkoutRef": "main",
    "installMode": "source-checkout",
    "notes": "Portable adapter still needs source checkout versus package CLI mode verification."
  },
  "commands": {
    "setup": "npm install",
    "start": "npm run start",
    "stop": null
  },
  "env": {
    "files": [
      "config/env/hermes-web-ui.env"
    ],
    "variables": {
      "HERMES_HOME": "${USB_ROOT}/data/hermes",
      "HERMES_WEB_UI_DATA_DIR": "${USB_ROOT}/data/hermes-web-ui"
    }
  },
  "dataDir": "data/hermes-web-ui",
  "logFile": "data/logs/hermes-web-ui.log",
  "pidFile": "data/tmp/pids/hermes-web-ui.pid",
  "health": {
    "type": "http",
    "url": "http://127.0.0.1:8648",
    "timeoutSeconds": 30
  },
  "portal": {
    "label": "Hermes Web UI",
    "url": "http://127.0.0.1:8648",
    "group": "Hermes"
  },
  "dependsOn": [
    "hermes-agent"
  ]
}
```

## 4. Field Reference

### `id`

Stable machine-readable service id.

Rules:

- lowercase
- kebab-case
- unique across adapters

Examples:

- `openclaw`
- `hermes-agent`
- `hermes-web-ui`

### `displayName`

Human-readable service name shown in logs and portal.

### `description`

Short description for developers and portal metadata.

### `type`

General service category.

Initial supported values:

- `node-service`
- `python-service`
- `binary-service`
- `static-portal`
- `custom`

### `enabled`

Whether the service is enabled by default.

Disabled services should be ignored by `Start.bat` unless explicitly requested.

### `appDir`

Relative path from project root to the upstream application directory.

Example:

```text
apps/hermes-web-ui
```

Adapters must not use absolute paths.

### `runtime`

Runtime requirement.

Fields:

- `kind`: `node`, `python`, `git`, `binary`, or `none`
- `platform`: `windows`, `macos`, or `any`
- `requiredExecutable`: executable name expected under the runtime path
- `versionRequirement`: optional upstream version range, for example `>=23.0.0`

### `upstream`

Upstream source and installation metadata.

Fields:

- `name`: upstream project or package name
- `repositoryUrl`: canonical source repository URL
- `installDocs`: upstream installation or platform documentation URL
- `checkoutRef`: branch, tag, or revision expected by the adapter
- `installMode`: `source-checkout`, `package`, `manual`, or `unknown`
- `notes`: concise integration notes or current blocker

This metadata is consumed by `node core/node/dist/clawhermes.js adapters --json` and `node core/node/dist/clawhermes.js sources --json`. It should be updated before a real integration is marked production-ready.

### `commands`

Commands used by setup/start/stop flows.

Rules:

- Commands run from `appDir` unless overridden.
- Commands may use `${USB_ROOT}` placeholders.
- `stop` may be null if the generic process manager handles stop by PID.

### `env.files`

List of env files to load before starting the service.

Files should be relative to project root.

Example files should be committed with `.example` suffix. Real env files should be local and ignored.

### `env.variables`

Inline environment variables to set for this service.

Placeholders:

- `${USB_ROOT}`
- `${DATA_DIR}`
- `${APP_DIR}`
- `${PORT}`
- `${SERVICE_ID}`

### `dataDir`

Relative path to the service's portable data directory.

### `logFile`

Relative path to the service log file.

### `pidFile`

Relative path to the PID metadata file.

### `health`

Health check descriptor.

Supported MVP types:

#### HTTP

```json
{
  "type": "http",
  "url": "http://127.0.0.1:8648",
  "timeoutSeconds": 30
}
```

#### TCP

```json
{
  "type": "tcp",
  "host": "127.0.0.1",
  "port": 8642,
  "timeoutSeconds": 30
}
```

#### Process

```json
{
  "type": "process",
  "timeoutSeconds": 10
}
```

### `portal`

Portal metadata.

Fields:

- `label`: visible button label
- `url`: service URL
- `group`: visual grouping

### `dependsOn`

List of service ids that must start before this service.

The orchestrator must topologically sort services. Cycles are invalid.

## 5. Adapter Responsibilities

Adapters should:

- keep service-specific assumptions local
- document upstream version expectations
- define health checks
- define data directories
- define env files
- avoid host-specific absolute paths

Adapters should not:

- permanently modify the host machine
- install global packages on the host
- write secrets into committed files
- reach into another adapter's private directory
- duplicate core process management logic unless necessary

## 6. Initial Service Adapters

### 6.1 OpenClaw

Purpose:

- Run official OpenClaw.
- Expose Control UI and WebChat.
- Store OpenClaw state under `data/openclaw`.

Open questions:

- Official portable Windows startup mode.
- Exact supported environment variables for data/home paths.
- Default ports and how to remap them.

### 6.2 Hermes Agent

Purpose:

- Run Hermes Agent gateway/API.
- Set `HERMES_HOME` to `data/hermes`.
- Provide backend for Hermes Web UI.

Expected default port:

- `8642`

### 6.3 Hermes Web UI

Purpose:

- Run EKKOLearnAI/hermes-web-ui.
- Connect to Hermes Agent.
- Store UI state under `data/hermes-web-ui`.

Expected default port:

- `8648`

## 7. Versioning

Each adapter should eventually record upstream version metadata.

Suggested file:

```text
adapters/<service-id>/version.json
```

Example:

```json
{
  "upstream": "EKKOLearnAI/hermes-web-ui",
  "version": "unknown",
  "source": "manual",
  "installedAt": null
}
```

## 8. Validation Rules

The adapter validator should fail if:

- `id` is missing
- `appDir` is absolute
- `dataDir` is absolute
- `logFile` is outside `data/logs`
- `pidFile` is outside `data/tmp`
- `dependsOn` references an unknown service
- health check is missing
- portal URL is missing for user-facing services

Warnings should be emitted if:

- service is enabled but app directory is empty
- runtime executable is missing
- runtime version does not satisfy `versionRequirement`
- env file is missing
- default port is occupied

## 9. Adapter Preparation Command

Use the adapter guidance command before attempting real upstream integration:

```powershell
node core/node/dist/clawhermes.js adapters --json
node core/node/dist/clawhermes.js adapters hermes-web-ui --json
```

The command reports:

- whether `appDir` and `dataDir` exist
- runtime metadata declared by the adapter
- env file presence and example template presence
- setup/start/stop commands
- dependency ids
- integration readiness metadata
- next steps before production-ready startup

Do not mark an adapter `productionReady: true` until the app directory, env files, setup command, start command, health check, and data path behavior have been verified.

## 10. App Source Preparation and Checkout Commands

Use the source plan command when preparing upstream application checkouts:

```powershell
node core/node/dist/clawhermes.js sources --json
node core/node/dist/clawhermes.js sources hermes-web-ui --json
```

The command is read-only. It reports:

- target app directory paths under `apps/`
- whether each app directory exists and contains real content
- upstream repository metadata from `adapter.json`
- suggested `git clone` command text
- `wouldModify: false` for automation safety checks

Do not treat the suggested clone command as an automatic installer. Network and filesystem mutations should stay behind an explicit user or operator action.

Before checkout, use the read-only source probe command to verify repository reachability and checkout ref availability:

```powershell
node core/node/dist/clawhermes.js probe-sources --json
node core/node/dist/clawhermes.js probe-sources hermes-web-ui --json
```

The command runs `git ls-remote`, does not clone, and reports `wouldModify: false`.

When the operator is ready to checkout one adapter source, use the guarded checkout command:

```powershell
node core/node/dist/clawhermes.js checkout-source hermes-web-ui --dry-run --json
node core/node/dist/clawhermes.js checkout-source hermes-web-ui --confirm-checkout --json
```

Rules:

- The command requires a single service id.
- Dry-run does not modify `apps/` and reports `wouldModify: false`.
- Real checkout refuses to run unless `--confirm-checkout` is passed.
- Real checkout refuses app directories that already contain real content.
- Placeholder-only app directories may contain `.gitkeep`; the command removes only that placeholder before cloning.

## 11. Adapter Setup Execution Command

After source checkout, use the guarded setup command to inspect or run an adapter's setup command:

```powershell
node core/node/dist/clawhermes.js setup-adapter hermes-web-ui --dry-run --json
node core/node/dist/clawhermes.js setup-adapter hermes-web-ui --confirm-setup --json
```

Rules:

- The command requires a single service id.
- The adapter must declare `commands.setup`.
- The app directory must exist and contain real content.
- Dry-run does not execute the setup command and reports `wouldModify: false`.
- Real setup refuses to run unless `--confirm-setup` is passed.
- The command runs from `appDir` with the same resolved service environment used for startup.
- JSON output lists environment variable names and env file diagnostics, not secret values.

## 12. Guarded Adapter Start Command

Use the guarded start command in disposable integration roots when an adapter is not marked production-ready yet:

```powershell
node core/node/dist/clawhermes.js start-adapter hermes-web-ui --confirm-start --json
```

Rules:

- The command requires a single service id.
- `--dry-run` reports the command and app directory without launching anything.
- Real startup refuses to run unless `--confirm-start` is passed.
- The command uses the same managed lifecycle as production startup and writes standard PID metadata.
- Normal `start` still requires `integration.productionReady: true` and a real app directory; placeholder-only app directories stay in placeholder mode.

## 13. Adapter Verification Command

Before marking an adapter production-ready, run the read-only verifier:

```powershell
node core/node/dist/clawhermes.js verify-adapter hermes-web-ui --json
```

The verifier reports `productionReadyCandidate` and individual checks for:

- app directory readiness
- setup command declaration
- setup output log presence
- start command declaration
- env file presence
- health check declaration
- health behavior

The command does not modify `adapter.json`. Use the result as evidence for a later explicit production-readiness metadata update.

## 14. Adapter Readiness Metadata Command

After `verify-adapter` reports `productionReadyCandidate: true`, update integration metadata with the guarded metadata command:

```powershell
node core/node/dist/clawhermes.js mark-adapter-ready hermes-web-ui --confirm-ready --summary "Verified locally" --json
```

Rules:

- The command requires a single service id.
- The command refuses to run unless `--confirm-ready` is passed.
- `--summary` is required and should describe the verification evidence.
- The command reruns `verify-adapter` and refuses to write metadata if verification fails.
- Only `adapters/<service-id>/adapter.json` is updated.
- The command sets `integration.status` to `verified`, `integration.productionReady` to `true`, and `integration.verifiedAt` to the current date.

## 15. Contributor Workflow

To add a new service:

1. Create `adapters/<new-service>/`.
2. Add `adapter.json`.
3. Add `README.md`.
4. Add env examples under `config/env/`.
5. Add app placeholder under `apps/<new-service>/`.
6. Add data directory under `data/<new-service>/`.
7. Run `node core/node/dist/clawhermes.js adapters <new-service> --json`.
8. Run `node core/node/dist/clawhermes.js sources <new-service> --json`.
9. Run `node core/node/dist/clawhermes.js probe-sources <new-service> --json`.
10. Run `node core/node/dist/clawhermes.js checkout-source <new-service> --dry-run --json` before any real checkout.
11. Run `node core/node/dist/clawhermes.js setup-adapter <new-service> --dry-run --json` before any real setup.
12. Run `node core/node/dist/clawhermes.js verify-adapter <new-service> --json`.
13. Run `node core/node/dist/clawhermes.js mark-adapter-ready <new-service> --confirm-ready --summary "<evidence>" --json` only after verification passes.
14. Update portal metadata if needed.

No core code should be changed unless the service needs a new generic capability.

## 16. WSL2 Adapter Diagnostics

Adapters that must run inside WSL2 should declare their Windows-side launcher dependency as:

```json
{
  "runtime": {
    "kind": "wsl2",
    "platform": "windows",
    "requiredExecutable": "wsl.exe"
  },
  "integration": {
    "platform": "wsl2",
    "strategy": "wsl2-adapter"
  }
}
```

Before attempting WSL2 setup or startup, run:

```powershell
node core/node/dist/clawhermes.js wsl --distro Ubuntu --json
node core/node/dist/clawhermes.js wsl-workflow hermes-agent --json
```

Rules:

- The diagnostic is read-only.
- Users must explicitly approve WSL2 preparation before WSL2 adapters can run; ClawHermes-USB must not silently enable Windows features or install Linux distributions.
- `wsl-workflow <service-id>` is read-only and should show the full operator sequence from diagnostics through production-readiness metadata.
- Inspect the host-level preparation plan with `node core/node/dist/clawhermes.js prepare-wsl --distro Ubuntu --dry-run --json`.
- A typical explicit installation command is `wsl.exe --install -d Ubuntu`, followed by the standard WSL first-run initialization.
- Real host preparation must require `--confirm-install`.
- A future `wsl --import` workflow may store distro files under the USB/project path, but the imported distro is still registered on the current Windows host.
- Missing `wsl.exe`, missing distributions, and missing WSL2 distributions must be reported as setup actions.
- When `runtime.distro` is set, WSL commands must include `--distribution <name>` and diagnostics must verify that target distribution.
- WSL2 adapter setup/start commands must not run until the WSL2 diagnostic is healthy.
- Confirmed WSL2 adapter setup executes through the same WSL adapter command plan and writes `data/logs/setup-<service-id>.log`.
- Confirmed WSL2 adapter startup launches a Windows-side managed `wsl.exe` process and writes normal PID metadata.
- `stop` terminates the managed Windows-side process tree recorded in the PID metadata. A later adapter-specific stop hook may add graceful in-distro shutdown before process termination.
