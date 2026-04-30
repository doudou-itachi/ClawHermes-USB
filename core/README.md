# Core

The core layer will contain service-agnostic orchestration logic.

Core modules should know how to:

- resolve portable paths
- load config
- validate adapters
- check ports
- start and stop processes
- write logs
- run health checks
- create backups

Core modules should not know OpenClaw or Hermes internals. Service-specific behavior belongs in `adapters/`.
