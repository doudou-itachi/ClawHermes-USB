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
