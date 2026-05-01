# Hermes Web UI Adapter

This adapter integrates EKKOLearnAI/hermes-web-ui.

## Responsibilities

- Run Hermes Web UI from `apps/hermes-web-ui`.
- Connect it to Hermes Agent.
- Store UI state under `data/hermes-web-ui`.
- Expose the UI link in the local portal.

## Expected Defaults

- UI host: `127.0.0.1`
- UI port: `8648`
- Hermes backend: `http://127.0.0.1:8642`

## Notes

The current upstream quick start documents `hermes-web-ui start`, with `hermes-web-ui start --port <port>` for custom ports and `hermes-web-ui stop` for shutdown.

## 2026-04-30 Upstream Check

EKKOLearnAI/hermes-web-ui defaults to port `8648` and proxies Hermes Gateway on `8642`. It can be run through a globally installed CLI package, while development mode uses source checkout commands.

For ClawHermes-USB, the adapter remains a candidate until we decide whether portable runtime setup should install the CLI package into the USB environment or run from the `apps/hermes-web-ui` source checkout.

## 2026-05-01 Current-Root Payload Verification

The current USB root now has a real upstream source checkout under `apps/hermes-web-ui`, pinned for this verification pass at commit `b508de843fc8c9add284264759dee18c525b4f69`.

Validation used official portable Node.js `v24.15.0` from `runtimes/windows/node`.

Verified commands:

- `node core\node\dist\clawhermes.js setup-adapter hermes-web-ui --confirm-setup --json`
- `node core\node\dist\clawhermes.js start-adapter hermes-agent --confirm-start --json`
- `node core\node\dist\clawhermes.js start-adapter hermes-web-ui --confirm-start --json`
- `Invoke-WebRequest http://127.0.0.1:8642/health`
- `Invoke-WebRequest http://127.0.0.1:8648`
- `node core\node\dist\clawhermes.js verify-adapter hermes-web-ui --json`

Result:

- Hermes Agent health returned `{"status": "ok", "platform": "hermes-agent"}`.
- Hermes Web UI returned HTTP `200` with the Vite HTML app shell.
- `verify-adapter hermes-web-ui --json` reported all checks passing and `productionReadyCandidate: true`.

The app checkout and `node_modules` remain ignored payload content. The parent repository keeps only the `.gitkeep` placeholder tracked.
