# First Runnable Skeleton Design

## Goal

Turn the current documented skeleton into a Windows-first runnable shell that can validate its portable layout, load adapters, write logs, record placeholder process metadata, and expose a local portal file/server target without integrating real upstream OpenClaw or Hermes payloads yet.

## Scope

This phase implements the second milestone described in `docs/PRD.md`, but with placeholder service execution only. It must prove the ClawHermes-USB orchestration boundary before upstream tools are installed.

Included:

- Windows root detection from launcher location.
- Process-local portable environment preparation.
- Runtime directory and executable validation.
- Adapter descriptor loading and validation.
- Start/status/stop command flow.
- Logs under `data/logs`.
- PID metadata under `data/tmp/pids`.
- Minimal portal content generated from adapter metadata.

Excluded:

- Downloading or installing OpenClaw, Hermes Agent, or Hermes Web UI.
- Running real upstream service commands.
- Automatic port remapping.
- macOS runtime behavior beyond preserving existing placeholders.

## Architecture

The Windows batch files remain thin user entry points. They resolve the repository root and call PowerShell orchestration scripts under `core/windows`.

`core/windows/ClawHermes.Core.psm1` owns reusable service-agnostic behavior:

- path resolution
- portable environment construction
- runtime lookup
- adapter loading and validation
- log writing
- placeholder service metadata
- portal HTML generation

`core/windows/clawhermes.ps1` is the command dispatcher used by `Start.bat`, `Setup.bat`, `Status.bat`, and `Stop.bat`.

## Data Flow

1. A launcher calls `clawhermes.ps1` with an action and `USB_ROOT`.
2. The dispatcher imports the core module.
3. The core prepares required directories and portable environment variables for child processes.
4. The core loads `adapters/*/adapter.json` and validates descriptor shape and relative paths.
5. `setup` validates runtimes, adapters, config, and data writeability.
6. `start` writes launcher logs, creates placeholder PID metadata for enabled adapters with start commands or known placeholders, and generates `portal/index.html`.
7. `status` reads PID metadata and adapter descriptors.
8. `stop` marks placeholder services stopped and removes PID metadata.

## Error Handling

Commands should fail fast with direct messages when required files, JSON, or paths are invalid. Missing portable runtime executables are reported as validation failures, not hidden behind global host runtimes.

## Testing

Python `unittest` tests execute PowerShell commands against the repository. They cover root resolution, portable environment values, adapter validation, setup output, start/status/stop metadata, and portal generation.

Tests do not require real portable Node.js, Python, or Git payloads. Runtime validation reports missing executables as expected setup diagnostics.
