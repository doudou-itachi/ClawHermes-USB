# Cross-Platform USB Release Design

## Goal

Produce one `dist-usb/ClawHermes` release directory that can be copied to a USB drive and run on both Windows and macOS.

Windows keeps the existing root `ClawHermes-Control.exe` flow. macOS gets a root `.command` launcher that starts the shared TypeScript core, opens the local Portal/control browser experience, and can prefer a bundled Electrobun `.app` when a macOS build is present.

## Non-Goals

- No signed macOS `.dmg` in the first milestone.
- No requirement that a native macOS PyQt/Electrobun shell must be present before the cross-platform USB release can run. The browser Portal fallback remains mandatory.
- No Linux desktop support in this release design.
- No rewrite of the existing adapter/core architecture into shell scripts.

## Reference Model

`dongsheng123132/u-claw` validates the simplest useful macOS portable pattern:

- macOS users double-click a `.command` launcher.
- The launcher detects `arm64` versus `x86_64`.
- The launcher selects a bundled Node.js runtime.
- The launcher removes `com.apple.quarantine` when possible.
- Runtime data stays inside the portable directory.
- Browser URLs are opened with macOS `open`.

ClawHermes should reuse those platform lessons, but keep lifecycle, adapters, status, ports, and control APIs in the existing TypeScript core.

## Release Layout

The release root should look like this:

```text
ClawHermes/
  ClawHermes-Control.exe
  ClawHermes-Control-Mac.app/
  Start-ClawHermes-Mac.command
  Setup-Mac.command
  START_HERE.txt
  release-manifest.json

  adapters/
  apps/
  config/
  core/
  data/
  docs/
  portal/
  skills/

  runtimes/
    windows/node/
    windows/python/
    macos/node/darwin-arm64/
    macos/node/darwin-x64/

  runtime-archives/
    macos/node-v22-darwin-arm64.tar.gz
    macos/node-v22-darwin-x64.tar.gz
```

`runtimes/macos/node/*` may be absent in the generated Windows-side artifact. The macOS launcher extracts the matching archive into that path on first run so executable bits and symlinks are preserved on the Mac filesystem.

Python for macOS is deferred until Hermes Agent macOS verification. The first milestone may rely on system Python only for diagnostics, not for production service startup.

`ClawHermes-Control-Mac.app` is optional in the first milestone. When it is available, `Start-ClawHermes-Mac.command` should open it for a Windows-like desktop UI. When it is absent or fails to start, the launcher should fall back to opening the browser Portal so the same USB release still works.

## macOS Launcher

`Start-ClawHermes-Mac.command` is a thin platform bootstrapper. It should:

1. Resolve `ROOT` from the script location.
2. Detect `uname -m` and map `arm64` to `darwin-arm64`, `x86_64` to `darwin-x64`.
3. Remove quarantine recursively with `xattr -rd com.apple.quarantine "$ROOT"`, ignoring failure.
4. Ensure `runtimes/macos/node/<platform>/bin/node` exists, extracting the matching tarball from `runtime-archives/macos/` when needed.
5. Run `core/node/dist/clawhermes.js start --usb-root "$ROOT" --json`.
6. If `ClawHermes-Control-Mac.app` exists, launch it with `open "$ROOT/ClawHermes-Control-Mac.app"`.
7. If the app is absent or fails to launch, read the returned Portal URL, or fall back to `data/tmp/ports.json`.
8. Open the Portal URL with `open`.
9. Keep the terminal open long enough to show errors when startup fails.

`Setup-Mac.command` is optional but useful. It should run the same runtime preparation checks without starting services.

## Core Platform Support

Add a small platform module rather than scattering `process.platform` checks:

- platform id: `windows`, `darwin`, `linux`
- architecture id: `x64`, `arm64`
- executable suffixes
- PATH separator
- shell command for setup scripts
- browser open command
- runtime candidate roots
- quarantine cleanup support

Existing modules should consume this abstraction:

- `portableEnv` builds platform-correct PATH and cache paths.
- `runtimeDiagnostics` resolves the current platform's runtime manifest entries.
- `setupDiagnostics` suppresses WSL actions on non-Windows platforms.
- port checks use Node socket probing everywhere, with OS-specific command probing only as a best-effort supplement.
- `device-binding` adds a macOS fingerprint path based on the mounted volume UUID, falling back to machine UUID or seed file.

## Runtime Manifest

Keep the current Windows behavior compatible, but extend runtime metadata with platform-specific entries. The core should select the entry for the current platform and architecture.

The first supported macOS runtime is Node.js:

- `darwin-arm64`: `runtimes/macos/node/darwin-arm64/bin/node`
- `darwin-x64`: `runtimes/macos/node/darwin-x64/bin/node`

The release manifest should distinguish:

- installed runtime: already expanded and executable
- archived runtime: included and extractable by launcher
- missing runtime: target machine must provide it on PATH

## Adapter Platform Overrides

Adapter descriptors should remain shared, with platform overrides instead of separate adapter files.

Shape:

```json
{
  "platformOverrides": {
    "darwin": {
      "runtime": {},
      "commands": {},
      "env": {}
    }
  }
}
```

Resolution order:

1. Load base adapter.
2. Apply `platformOverrides[platform]` if present.
3. Apply runtime port substitutions.
4. Resolve service environment.

Milestone 1 should support OpenClaw and the control/Portal path on macOS. Hermes Agent and Hermes Web UI can report blocked or unverified until their macOS commands and runtime requirements are validated.

## macOS Electrobun UI

macOS can use the same Electrobun control shell concept as Windows, but the current implementation needs platform work before it is shippable:

- `launcher/electrobun/electrobun.config.ts` already contains a `build.mac` section.
- `launcher/electrobun/package.json` only exposes `build:win`; add macOS build scripts for Apple Silicon and Intel targets.
- `launcher/electrobun/src/bun/index.ts` resolves only `runtimes/windows/node/node.exe`; replace it with platform-aware runtime selection.
- `pingSync` currently shells out to `node` from `PATH`; it should use the same resolved portable Node executable.
- The release builder should copy the macOS Electrobun `.app` into the USB root when a macOS build artifact exists.

This should be a preferred UI path, not the only macOS path. The `.command` launcher remains the compatibility layer because macOS `.app` packaging, signing, notarization, and quarantine behavior require separate verification on a Mac build host or macOS CI.

## Release Builder

Keep `scripts/release/Build-UsbRelease.ps1` as the main builder so the current Windows build host can create the cross-platform artifact.

Add these responsibilities:

- copy macOS launcher scripts to the release root
- copy the macOS Electrobun `.app` to the release root when available
- copy macOS Node runtime archives into `runtime-archives/macos/`
- write cross-platform entrypoint details into `release-manifest.json`
- include Mac instructions in `START_HERE.txt`
- preserve existing Windows `ClawHermes-Control.exe` behavior

If producing a `.zip`, the builder should use a tool or process that preserves executable bits for `.command` files when practical. The launcher should still print a fallback instruction:

```bash
chmod +x Start-ClawHermes-Mac.command Setup-Mac.command
```

## User Experience

Windows:

- user opens `ClawHermes-Control.exe`
- behavior remains unchanged

macOS:

- user opens `Start-ClawHermes-Mac.command`
- terminal shows runtime preparation and startup status
- the launcher opens `ClawHermes-Control-Mac.app` when present
- otherwise, browser opens the local Portal/control URL
- user can stop services from the browser control API or close the terminal if the launcher is running attached

The root `START_HERE.txt` should show both paths clearly.

## Testing

Add focused tests that do not require a real Mac:

- macOS launcher text contains architecture detection, quarantine cleanup, archive extraction, and `clawhermes.js start`.
- runtime manifest selection returns darwin candidates when platform is injected in tests.
- `portableEnv` uses `:` for darwin PATH and `;` for Windows PATH.
- non-Windows setup diagnostics do not emit WSL actions.
- adapter override resolution applies darwin command/env overrides without changing Windows behavior.
- Electrobun control shell resolves macOS portable Node candidates when platform is injected in tests.

Manual verification on macOS is still required before marking macOS production-ready:

1. Copy generated release to an exFAT USB drive.
2. Run `Start-ClawHermes-Mac.command` on Apple Silicon.
3. Run `Start-ClawHermes-Mac.command` on Intel Mac or Rosetta-free x64 environment if available.
4. Confirm Portal opens and service status is visible.
5. Confirm stop/shutdown cleans PID metadata and ports.

## Implementation Order

1. Add platform abstraction and tests.
2. Add macOS launcher scripts with runtime extraction and startup logic.
3. Extend runtime manifest handling for platform/architecture selection.
4. Add adapter platform override resolution.
5. Update release builder to emit one cross-platform `dist-usb/ClawHermes`.
6. Add optional macOS Electrobun app packaging and fallback launch behavior.
7. Verify Windows release remains unchanged.
8. Perform macOS manual verification and then mark supported services production-ready.
