# Upstream Integration Notes

Last verified: 2026-05-01

This document records the current upstream startup facts that affect ClawHermes-USB adapters. It is intentionally conservative: production adapter commands should not be enabled until the portable data paths, process behavior, and Windows support level are verified against installed upstream payloads.

## OpenClaw

Source:

- <https://github.com/openclaw/openclaw/blob/main/docs/platforms/windows.md>

Current conclusion:

- WSL2 is the recommended Windows path for the full OpenClaw experience.
- Native Windows CLI and gateway flows exist, but upstream still documents caveats around onboarding, gateway install, Scheduled Tasks, and fallback Startup-folder behavior.
- For portable USB use, `openclaw gateway run` is the safest candidate because it avoids installing a managed service.
- `commands.start` remains `null` in `adapters/openclaw/adapter.json` until OpenClaw data path variables, gateway port, Control UI URL, and WebChat URL are verified from an installed payload.

Adapter status: `blocked`

## Hermes Agent

Sources:

- <https://hermes-agent.org/>
- <https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/gateway.py>

Current conclusion:

- Official public docs list Linux, macOS, and WSL2 as the supported install path; native Windows is experimental.
- The Hermes gateway command suite handles `run`, `start`, `stop`, `restart`, `status`, `install`, `uninstall`, and `setup`.
- For a portable process manager, foreground `hermes gateway run` is a better candidate than daemonizing `hermes gateway start`.
- The adapter now records `hermes gateway run` as the candidate command, but production startup remains blocked until native Windows/WSL2 strategy and `HERMES_HOME` behavior are verified locally.

Adapter status: `blocked`

## Hermes Web UI

Source:

- <https://github.com/EKKOLearnAI/hermes-web-ui>

Current conclusion:

- Upstream source checkout under `apps/hermes-web-ui` works with official portable Node.js 24.15.0.
- `npm install` completed successfully in a disposable Windows lab root.
- `npm run start` launched through `start-adapter hermes-web-ui --confirm-start`.
- Default UI URL is `http://127.0.0.1:8648`.
- The BFF server proxies to Hermes Gateway on port `8642`.
- `status --json` reported HTTP health ready with status code `200`.
- `verify-adapter hermes-web-ui --json` reported `productionReadyCandidate: true`.
- The default repository still keeps only a `.gitkeep` app placeholder; normal `start` stays in placeholder mode until the current USB root has a real checkout.

Adapter status: `verified`

## Next Integration Gate

Before replacing placeholder services with real upstream processes:

1. Place portable runtimes under `runtimes/windows/`.
2. Install or check out upstream payloads under `apps/`.
3. Verify each candidate command from the portable environment only.
4. Confirm data writes stay under `data/`.
5. Capture exact ports and health checks in adapter descriptors.
6. Update `docs/PROGRESS.md` with validation evidence.
