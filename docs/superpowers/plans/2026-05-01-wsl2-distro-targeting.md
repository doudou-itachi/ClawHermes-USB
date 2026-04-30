# WSL2 Distro Targeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WSL2 adapter execution target an explicit WSL distribution instead of relying on the host default distro.

**Architecture:** Add optional `runtime.distro` metadata for WSL2 adapters. WSL diagnostics accept a desired distro, setup diagnostics validate that distro, and WSL setup/start plans include `--distribution <name>`.

**Tech Stack:** TypeScript CLI/diagnostics, adapter metadata, Python `unittest`.

---

### Task 1: Explicit WSL2 Distro Targeting

**Files:**
- Modify: `adapters/hermes-agent/adapter.json`
- Modify: `core/node/src/types.ts`
- Modify: `core/node/src/wsl.ts`
- Modify: `core/node/src/wsl-adapter.ts`
- Modify: `core/node/src/diagnostics.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/node/dist/`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing distro targeting tests**

Add tests for `wsl --distro Ubuntu --json`, Hermes Agent adapter metadata, and WSL setup/start dry-run arguments.

- [x] **Step 2: Add distro metadata and diagnostics**

Record `runtime.distro`, return desired distro fields in WSL diagnostics, and surface missing target distro as an action.

- [x] **Step 3: Add CLI and command plan wiring**

Parse `--distro`, pass distro to diagnostics, and include `--distribution <distro>` in WSL setup/start plans.

- [x] **Step 4: Update progress docs**

Record explicit Ubuntu targeting and remaining installation blocker.

- [x] **Step 5: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, UTF-8 smoke check, and confirm no `ClawHermes-USB*` directories remain under `%TEMP%`.
