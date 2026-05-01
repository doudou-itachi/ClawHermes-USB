# OpenClaw Adapter

This adapter will integrate the official OpenClaw runtime.

## Responsibilities

- Launch official OpenClaw without forking it.
- Keep OpenClaw state under `data/openclaw`.
- Expose Control UI and WebChat links to the portal.
- Document upstream version and startup mode.

## Open Questions

- Exact official Windows-native startup command.
- Exact portable data directory environment variables.
- Default ports for gateway, Control UI, and WebChat.
- Whether OpenClaw requires additional service registration for Windows.

Until those are confirmed, `adapter.json` intentionally leaves `commands.start` and portal URL as `null`.

## 2026-05-01 Upstream Check

OpenClaw's current Windows documentation says WSL2 is the more stable and recommended path for the full experience. Native Windows CLI and gateway flows exist, but the documented service install path can use Scheduled Tasks or Startup-folder fallback behavior.

For ClawHermes-USB, this adapter is modeled as a WSL2 adapter. Production startup remains blocked until a portable foreground gateway mode, data directory behavior, gateway port, and UI ports are verified locally from an installed payload.
