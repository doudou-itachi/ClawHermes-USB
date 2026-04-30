# Core

The core layer contains service-agnostic orchestration logic.

The primary implementation is now TypeScript + Node.js:

```text
core/node/src/   TypeScript source.
core/node/dist/  Built JavaScript used by launchers.
```

Windows keeps a thin PowerShell wrapper at:

```text
core/windows/clawhermes.ps1
```

The wrapper only resolves Node.js and forwards commands to `core/node/dist/clawhermes.js`.

Core modules should know how to:

- resolve portable paths
- load config
- validate adapters
- check ports
- start and stop processes
- write logs
- run health checks
- create backups

Core modules should not know OpenClaw or Hermes internals. Service-specific behavior belongs in `adapters/`.

## Development

Build the TypeScript core:

```powershell
npm run build
```

Run the behavior tests:

```powershell
npm test
```

Show runtime preparation guidance:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File core\windows\clawhermes.ps1 runtimes -UsbRoot .
```
