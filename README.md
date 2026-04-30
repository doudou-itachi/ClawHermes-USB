# ClawHermes-USB

ClawHermes-USB is a Windows-first portable runtime suite for running official OpenClaw, Hermes Agent, and EKKOLearnAI/hermes-web-ui from a USB drive.

The project goal is not to fork these upstream tools. It provides a portable launcher, consistent directory layout, data isolation rules, service adapters, and a local portal so users can carry their agent environment between Windows machines with minimal host pollution.

## Current Status

This repository currently contains the project skeleton and detailed planning documents only.

It does not yet download, vendor, install, or run OpenClaw, Hermes Agent, or Hermes Web UI.

## Core Documents

- [PRD](docs/PRD.md)
- [Architecture Design](docs/DESIGN.md)
- [Adapter Contract](docs/ADAPTER_CONTRACT.md)

Chinese versions:

- [README.zh-CN.md](README.zh-CN.md)
- [PRD.zh-CN.md](docs/PRD.zh-CN.md)
- [DESIGN.zh-CN.md](docs/DESIGN.zh-CN.md)
- [ADAPTER_CONTRACT.zh-CN.md](docs/ADAPTER_CONTRACT.zh-CN.md)

## Design Goals

- Windows-first portable operation.
- Keep OpenClaw, Hermes Agent, Hermes Web UI, runtime dependencies, sessions, memory, skills, logs, and workspace data on the USB drive.
- Allow small unavoidable host traces, such as browser cache or OS-level recent-file metadata.
- Do not require Docker for the primary path.
- Preserve clear boundaries so future contributors can replace or extend services without rewriting the launcher.

## Planned Top-Level Layout

```text
ClawHermes-USB/
  launcher/   User-facing start, stop, setup, and status scripts.
  core/       Shared orchestration logic.
  adapters/   Service-specific integration descriptors and helpers.
  apps/       Upstream application checkouts or installed packages.
  runtimes/   Portable Node.js, Python, Git, and future platform runtimes.
  data/       Portable state, memory, sessions, logs, cache, and backups.
  portal/     Local unified entry page.
  config/     Defaults, env templates, profiles, and ports.
  scripts/    Setup, diagnostics, backup, and update automation.
  docs/       Product and architecture documentation.
```

## First Milestone

The first implementation milestone will create a Windows launcher that can:

1. Detect the USB root path dynamically.
2. Set portable environment variables for the current process tree.
3. Validate the presence of portable Node.js, Python, and Git.
4. Load service adapter descriptors.
5. Start placeholder services and write logs under `data/logs`.
6. Open the local portal at `http://127.0.0.1:17000/`.

Real OpenClaw and Hermes integration will follow after the launcher skeleton is verified.
