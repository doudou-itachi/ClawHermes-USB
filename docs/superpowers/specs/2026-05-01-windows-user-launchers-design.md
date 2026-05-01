# Windows User Launcher Design

## Goal

Make ClawHermes-USB usable by a non-technical Windows user from a USB drive while preserving the project's current safety rules around WSL2, ignored payloads, portable data, and explicit host changes.

The recommended release model is offline-first. A prepared USB package should include the portable runtimes, upstream app payloads, and WSL rootfs or WSL backup artifacts needed for normal installation. Network repair and update commands can exist, but they should be labeled as advanced maintenance and should not be part of the normal first-run path.

## User-Facing Entry Points

Add simple Windows launchers with names intended for double-click use:

- `1-Install-ClawHermes.bat`
- `2-Start-ClawHermes.bat`
- `3-Stop-ClawHermes.bat`
- `4-Status-ClawHermes.bat`
- `5-Backup-ClawHermes.bat`
- `6-Uninstall-Host-WSL-ClawHermes.bat`
- `Tools-Repair-Or-Update-ClawHermes.bat`

The exact visible names can be localized later. The first version should keep ASCII filenames so the scripts remain robust across Windows code pages, archive tools, and removable drives.

## Architecture

Keep Batch files thin. Each `.bat` resolves the USB root from its own location, then calls a shared PowerShell guide script under `launcher/windows/`.

The guide script should call the existing core dispatcher in `core/windows/clawhermes.ps1` instead of duplicating orchestration logic. The TypeScript core remains the source of truth for WSL import/export, adapter setup, service start/stop, status, backup, and payload inventory.

This keeps responsibilities clear:

- Batch launchers provide double-click entry points.
- PowerShell guide scripts handle friendly prompts, administrator relaunch, summaries, and pause-on-exit behavior.
- The TypeScript core performs all project-aware operations.

## Install Flow

The install launcher should run an interactive, staged flow:

1. Resolve the USB root and show it to the user.
2. Run setup diagnostics and payload inventory.
3. If WSL2 host features are missing, explain that Windows may require administrator permission and possibly a reboot before continuing.
4. Check for the expected rootfs or WSL backup artifacts under `runtimes/wsl/` or `data/backups/wsl/`.
5. Initialize missing env files from templates.
6. Import the managed `ClawHermes-Ubuntu` distro only after explicit confirmation.
7. Run guarded adapter setup commands.
8. Start services, open the local portal, and show the assigned URL.

The install script should be restartable. If a previous phase already completed, it should report that status and continue to the next needed phase.

## Start, Stop, Status, Backup

The start launcher should call the existing `start` command and then open the portal URL reported by `data/tmp/ports.json`, matching current `Start.bat` behavior.

The stop launcher should call `stop` and pause long enough for a normal user to see the result.

The status launcher should call `status --json`, summarize service readiness in friendly text, and point to the portal or logs when something is not ready.

The backup launcher should create a normal data backup. It should not unregister WSL, remove payloads, or delete host state.

## Uninstall Flow

The uninstall launcher should be explicitly scoped to host WSL cleanup. It should not delete the USB project, app payloads, or user data by default.

The flow should:

1. Stop running services.
2. Explain that unregistering `ClawHermes-Ubuntu` changes the current Windows host.
3. Require a project-local WSL export backup before unregistering.
4. Show the latest backup path.
5. Require an explicit typed confirmation before calling `wsl-unregister --confirm-unregister`.

This protects users from accidentally destroying the managed Linux environment without a backup.

## Advanced Repair Or Update

The advanced maintenance launcher can expose read-only diagnostics, payload inventory, runtime plan, source probes, and optional guarded checkout/setup commands.

It should clearly say that network operations may fail on restricted networks and are not required for normal offline use.

## Error Handling

Every user-facing launcher should pause on failure and show a short explanation plus the log location under `data/logs/`.

Dangerous or host-mutating actions must remain guarded:

- WSL host feature enablement requires explicit confirmation and may require administrator permission.
- WSL import requires explicit confirmation.
- WSL unregister requires backup evidence and explicit confirmation.
- Payload export and restore remain separate guarded operations.

## Testing

Add tests around the launchers without running real WSL host modifications:

- Batch launchers resolve the project root and forward exit codes.
- Install guide supports dry-run or plan mode for diagnostics.
- Start launcher still opens the runtime-assigned portal URL.
- Uninstall guide refuses to proceed without backup evidence in mocked or temporary project roots.
- PowerShell scripts use `-ExecutionPolicy Bypass` only for project-local scripts and do not permanently modify host environment variables.

Manual release verification should run the install flow on a clean Windows host or VM using a prepared offline payload package.
