# WSL2 Adapter Setup Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `setup-adapter` how to plan and guard setup commands for WSL2-backed adapters such as Hermes Agent.

**Architecture:** Keep Windows-native adapters on the current spawn path. For `runtime.kind: wsl2`, build a WSL execution plan that maps Windows project paths to `/mnt/<drive>/...`, exports resolved service environment variables, and runs the adapter setup command through `wsl.exe --cd <appDir> -- bash -lc <script>`.

**Tech Stack:** TypeScript adapter setup module, WSL diagnostics module, Python `unittest`.

---

### Task 1: WSL2 Setup Adapter Path

**Files:**
- Create: `core/node/src/wsl-adapter.ts`
- Modify: `core/node/src/adapter-setup.ts`
- Modify: `core/node/dist/`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing WSL2 setup-adapter tests**

Add tests for Hermes Agent WSL2 setup dry-run output and confirmed setup refusal when WSL diagnostics are unhealthy.

- [x] **Step 2: Implement WSL path and shell plan helpers**

Create helpers for Windows-to-WSL path conversion, POSIX shell quoting, and WSL setup argument generation.

- [x] **Step 3: Wire WSL2 setup path**

Route `setup-adapter` through the WSL plan for `runtime.kind: wsl2`, with dry-run safe output and confirmation/diagnostic gating for real execution.

- [x] **Step 4: Update progress docs**

Record the WSL2 setup planning behavior and current host blocker.

- [x] **Step 5: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, UTF-8 smoke check, and confirm no `ClawHermes-USB*` directories remain under `%TEMP%`.
