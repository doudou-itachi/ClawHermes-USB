# Split Diagnostics Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move setup diagnostics, required path checks, port checks, and controlled log tail reading out of the main core module.

**Architecture:** Create `core/node/src/diagnostics.ts` for setup aggregation, path diagnostics, port diagnostics, and log tail helpers. Keep `core.ts` focused on start/status/stop orchestration and re-export diagnostics helpers for compatibility.

**Tech Stack:** TypeScript, Node.js filesystem/process APIs, Python `unittest` integration tests.

---

### Task 1: Diagnostics Utilities Module

**Files:**
- Create: `core/node/src/diagnostics.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run tests covering setup JSON, path checks, port checks, occupied port reporting, and log tail behavior before changing code.

- [x] **Step 2: Extract diagnostics helpers**

Move setup diagnostics, path diagnostics, port diagnostics, log tail reading, and their private helpers into `diagnostics.ts`.

- [x] **Step 3: Wire core exports**

Update `core.ts` to import diagnostics helpers, use `setupDiagnostics` in `startSkeleton`, and re-export the public helper functions.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
