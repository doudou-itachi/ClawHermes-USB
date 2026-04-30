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

The command in `adapter.json` assumes a normal Node project start script. The real implementation must verify the current upstream package scripts before enabling production startup.
