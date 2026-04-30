# Project Progress

This document tracks meaningful progress for ClawHermes-USB.

Update it whenever a milestone is completed, changed, blocked, or deferred.

## Status Legend

- `Done`: Completed and validated.
- `In progress`: Actively being worked on.
- `Blocked`: Waiting on external information or action.
- `Deferred`: Intentionally postponed.

## 2026-04-30

### Initial Project Foundation

Status: `Done`

Summary:

- Created the ClawHermes-USB project directory.
- Established a maintainable project structure for launchers, core orchestration, adapters, upstream apps, portable runtimes, data, portal, config, scripts, and docs.
- Added detailed English and Chinese documentation.
- Added adapter descriptors for OpenClaw, Hermes Agent, and Hermes Web UI.
- Added initial Windows and macOS launcher placeholders.
- Added `AGENT.md` with project-level coding-agent rules.
- Initialized git, created the initial bilingual commit, connected the GitHub remote, and pushed `main`.

Changed areas:

- `README.md`
- `README.zh-CN.md`
- `docs/`
- `adapters/`
- `config/`
- `launcher/`
- `core/`
- `portal/`
- `apps/`
- `runtimes/`
- `data/`
- `AGENT.md`

Validation performed:

- JSON configuration and adapter files were parsed successfully.
- Git repository was initialized on `main`.
- Initial commit was pushed to `origin/main`.
- Local `HEAD` matched `origin/main`.

Next steps:

- Implement Windows launcher path resolution and environment validation.
- Add adapter validation tooling.
- Add a minimal local portal server.
- Verify official startup requirements for OpenClaw, Hermes Agent, and EKKOLearnAI/hermes-web-ui.
