# Hermes Agent Adapter

This adapter runs Hermes Agent as the backend runtime for Hermes Web UI.

## Responsibilities

- Set `HERMES_HOME` to `data/hermes`.
- Start the Hermes gateway/API server.
- Keep sessions, memory, skills, and cron state portable.
- Provide a health check for dependent services.

## Expected Defaults

- API host: `127.0.0.1`
- API port: `8642`
- Data root: `data/hermes`

## 2026-04-30 Upstream Check

Hermes Agent public docs list Linux, macOS, and WSL2 as the supported installation path, with native Windows described as experimental. The gateway command suite includes `run`, `start`, `stop`, `restart`, `status`, `install`, `uninstall`, and `setup`.

For ClawHermes-USB, foreground gateway execution is preferred because it can be managed by our process manager without installing a host service.

## 2026-05-01 WSL2 Verification

- Verified in the project-managed `ClawHermes-Ubuntu` WSL2 distribution.
- Real upstream checkout: `apps/hermes-agent`, commit `ec1443b`.
- Setup command: create a temporary CRLF-normalized copy of `setup-hermes.sh`, then pipe `n` responses for optional prompts into that temporary script.
- Start command: `./venv/bin/hermes gateway run`.
- Health URL: `http://127.0.0.1:8642/health`.
- `verify-adapter hermes-agent --json` reported `productionReadyCandidate: true`.

Adapter status: `verified`
