# WSL2 Adapter Start Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `start-adapter` how to plan and guard startup commands for WSL2-backed adapters such as Hermes Agent.

**Architecture:** Reuse the WSL2 command planning helpers introduced for setup. Dry-run returns the WSL command plan; confirmed startup refuses when WSL2 diagnostics are unhealthy. Real WSL process supervision remains a later phase after a WSL2 distro is available for integration testing.

**Tech Stack:** TypeScript lifecycle/core modules, WSL adapter helpers, Python `unittest`.

---

### Task 1: WSL2 Start Adapter Path

**Files:**
- Modify: `core/node/src/wsl-adapter.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/dist/`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing WSL2 start-adapter tests**

Add tests for Hermes Agent WSL2 start dry-run output and confirmed start refusal when WSL diagnostics are unhealthy.

- [x] **Step 2: Generalize WSL command planning**

Refactor setup-specific WSL planning into reusable command planning for setup/start phases.

- [x] **Step 3: Wire WSL2 start-adapter path**

Route `start-adapter` through the WSL plan for `runtime.kind: wsl2`, with dry-run safe output and WSL diagnostic gating for real startup.

- [x] **Step 4: Update progress docs**

Record the WSL2 start planning behavior and remaining real supervision blocker.

- [x] **Step 5: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, UTF-8 smoke check, and confirm no `ClawHermes-USB*` directories remain under `%TEMP%`.
