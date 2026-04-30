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
