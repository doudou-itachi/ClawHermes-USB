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

The command in `adapter.json` is a starting assumption. The real implementation must verify the current official Hermes Agent command on Windows before enabling production startup.
