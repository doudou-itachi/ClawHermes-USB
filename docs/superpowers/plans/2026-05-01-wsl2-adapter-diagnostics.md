# WSL2 Adapter Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first WSL2 adapter integration layer that lets ClawHermes-USB diagnose whether Hermes Agent can be hosted through WSL2 before any install/start work runs.

**Architecture:** Keep Windows Batch/PowerShell as the user entrypoint and add TypeScript diagnostics for the host WSL2 boundary. The Hermes Agent adapter remains blocked for native Windows, but records WSL2 as the intended integration platform and setup diagnostics show actionable WSL2 requirements.

**Tech Stack:** TypeScript core, Windows `wsl.exe` command probing, Python `unittest`, Markdown docs.

---

### Task 1: WSL2 Host Diagnostics

**Files:**
- Create: `core/node/src/wsl.ts`
- Modify: `core/node/src/types.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/node/src/diagnostics.ts`
- Modify: `core/node/dist/`
- Modify: `tests/test_windows_core.py`
- Modify: `adapters/hermes-agent/adapter.json`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing WSL diagnostic tests**

Add tests for `wsl --json`, setup action surfacing, and Hermes Agent adapter declaring WSL2 as its integration platform.

- [x] **Step 2: Implement WSL diagnostic module**

Create a focused module that detects `wsl.exe`, captures `wsl.exe --status` and `wsl.exe --list --verbose` when available, and returns structured JSON without throwing on missing WSL.

- [x] **Step 3: Wire CLI and setup diagnostics**

Expose `wsl --json` and include WSL diagnostics/actions in `setup --json`.

- [x] **Step 4: Update Hermes Agent metadata and docs**

Record that Hermes Agent is blocked for bare Windows but intended for a future WSL2 adapter path.

- [x] **Step 5: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, UTF-8 smoke check, and confirm no `ClawHermes-USB*` directories remain under `%TEMP%`.
