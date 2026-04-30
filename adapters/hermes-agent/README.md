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

## Notes

The command in `adapter.json` is a candidate foreground gateway command. The real implementation must verify the current official Hermes Agent behavior on Windows before enabling production startup.

## 2026-04-30 Upstream Check

Hermes Agent public docs list Linux, macOS, and WSL2 as the supported installation path, with native Windows described as experimental. The gateway command suite includes `run`, `start`, `stop`, `restart`, `status`, `install`, `uninstall`, and `setup`.

For ClawHermes-USB, `hermes gateway run` is the preferred candidate because it can be managed by our process manager without installing a host service. Production startup remains blocked until native Windows or WSL2 strategy and `HERMES_HOME` behavior are verified locally.
