# OpenClaw Adapter

This adapter will integrate the official OpenClaw runtime.

## Responsibilities

- Launch official OpenClaw without forking it.
- Keep OpenClaw state under `data/openclaw`.
- Expose Control UI and WebChat links to the portal.
- Document upstream version and startup mode.

## 2026-05-01 Upstream Check

OpenClaw's current Windows documentation says WSL2 is the more stable and recommended path for the full experience. Native Windows CLI and gateway flows exist, but the documented service install path can use Scheduled Tasks or Startup-folder fallback behavior.

For ClawHermes-USB, this adapter is modeled as a WSL2 adapter and uses foreground gateway execution rather than host service installation.

## 2026-05-01 WSL2 Verification

- Verified in the project-managed `ClawHermes-Ubuntu` WSL2 distribution.
- Real upstream checkout: `apps/openclaw`, commit `e8f9c3e6`.
- Setup installs or verifies Node.js 24, activates pnpm 10.33.2, runs `pnpm install && pnpm build` when needed, and writes project-local config/log paths.
- Start command: `node openclaw.mjs gateway --port 18789 --verbose --allow-unconfigured`.
- State directory: `data/openclaw`.
- Runtime log: `data/logs/openclaw-runtime.log`.
- Health URL: `http://127.0.0.1:18789/healthz`.
- `verify-adapter openclaw --json` reported `productionReadyCandidate: true`.

Adapter status: `verified`
