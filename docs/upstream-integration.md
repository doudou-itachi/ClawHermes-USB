# Upstream Integration Notes

Last verified: 2026-05-01

This document records the current upstream startup facts that affect ClawHermes-USB adapters. It is intentionally conservative: production adapter commands should not be enabled until the portable data paths, process behavior, and Windows support level are verified against installed upstream payloads.

## OpenClaw

Source:

- <https://docs.openclaw.ai/platforms/windows>
- <https://docs.openclaw.kr/cli/gateway>

Current conclusion:

- WSL2 is the more stable and recommended Windows path for the full OpenClaw experience.
- Native Windows CLI and gateway flows exist, but upstream still documents caveats around onboarding, gateway install, Scheduled Tasks, and fallback Startup-folder behavior.
- For portable USB use, foreground `node openclaw.mjs gateway --port 18789 --verbose --allow-unconfigured` is the verified source-checkout startup path because it avoids installing a managed service.
- A real upstream checkout is present locally at `apps/openclaw` for WSL2 validation, pinned for this verification pass at commit `e8f9c3e6`.
- `adapters/openclaw/adapter.json` now models OpenClaw as a WSL2 adapter targeting the managed `ClawHermes-Ubuntu` distribution, with `sourceDistro: Ubuntu` used for rootfs/import/export planning.
- Real setup was verified in WSL2 with Node.js 24.15.0, pnpm 10.33.2, project-local `data/openclaw/openclaw.json`, and project-local runtime logs at `data/logs/openclaw-runtime.log`.
- `status --json` and `verify-adapter openclaw --json` reported `http://127.0.0.1:18789/healthz` ready with status code `200`.
- OpenClaw health checks may take more than 10 seconds during startup or high event-loop load, so the adapter uses a 30-second HTTP health timeout.

Adapter status: `verified`

## Hermes Agent

Sources:

- <https://hermes-agent.org/>
- <https://github.com/NousResearch/hermes-agent>

Current conclusion:

- Official GitHub README says the installer works on Linux, macOS, WSL2, and Android via Termux.
- The same README says native Windows is not supported and Windows users should install WSL2.
- The official site says native Windows support is experimental.
- The Hermes gateway command suite handles `run`, `start`, `stop`, `restart`, `status`, `install`, `uninstall`, and `setup`.
- For a portable process manager, foreground `hermes gateway run` is a better candidate than daemonizing `hermes gateway start`.
- A real upstream checkout is present locally at `apps/hermes-agent` for WSL2 validation, pinned for this verification pass at commit `ec1443b`.
- `adapters/hermes-agent/adapter.json` now models Hermes Agent as a WSL2 adapter targeting the managed `ClawHermes-Ubuntu` distribution, with `sourceDistro: Ubuntu` used for rootfs/import/export planning.
- Real setup was verified in WSL2 with the upstream `setup-hermes.sh` script after normalizing CRLF line endings and declining interactive optional prompts.
- Foreground startup is verified with `./venv/bin/hermes gateway run`.
- `status --json` and `verify-adapter hermes-agent --json` reported `http://127.0.0.1:8642/health` ready with status code `200`.

Adapter status: `verified`

## Hermes Web UI

Source:

- <https://github.com/EKKOLearnAI/hermes-web-ui>

Current conclusion:

- Upstream source checkout under `apps/hermes-web-ui` works with official portable Node.js 24.15.0.
- A real upstream checkout is present locally at `apps/hermes-web-ui` for current-root validation, pinned for this verification pass at commit `b508de843fc8c9add284264759dee18c525b4f69`.
- `npm install` completed successfully in the current USB root through `setup-adapter hermes-web-ui --confirm-setup`.
- `npm run start` launched through `start-adapter hermes-web-ui --confirm-start`.
- Default UI URL is `http://127.0.0.1:8648`.
- The BFF server proxies to Hermes Gateway on port `8642`.
- With Hermes Agent running from the managed WSL2 adapter, `http://127.0.0.1:8642/health` returned `{"status": "ok", "platform": "hermes-agent"}`.
- `http://127.0.0.1:8648` returned HTTP `200` with the Vite HTML app shell.
- `status --json` reported Hermes Agent and Hermes Web UI HTTP health ready with status code `200`.
- `verify-adapter hermes-web-ui --json` reported `productionReadyCandidate: true`.
- The default repository keeps only a `.gitkeep` app placeholder; the real app checkout and `node_modules` stay ignored local payload content.

Adapter status: `verified`

## Current Integration Gate

Hermes Agent, OpenClaw, and Hermes Web UI are now verified adapters. Remaining production-hardening work should focus on packaging, repeatable operator setup, and keeping large WSL/app payloads out of git while preserving project-local backup and restore paths.
