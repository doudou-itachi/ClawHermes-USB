# Split Status Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move status health helper logic and status snapshot writing out of the main core module.

**Architecture:** Create `core/node/src/status.ts` for adapter health evaluation, process existence checks, HTTP health probing, and status snapshot writes. Keep `getStatus` in `core.ts` for now because it still composes adapter status with portal process status.

**Tech Stack:** TypeScript, Node.js filesystem/process APIs, PowerShell HTTP probe, Python `unittest` integration tests.

---

### Task 1: Status Helper Module

**Files:**
- Create: `core/node/src/status.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run tests covering status snapshots, stale managed process cleanup, process health, and HTTP health checks before changing code.

- [x] **Step 2: Extract status helpers**

Move `adapterHealth`, `probeHttpHealth`, `escapePowerShellSingleQuoted`, `processExists`, and `writeStatusSnapshot` into `status.ts`.

- [x] **Step 3: Wire imports and re-exports**

Import the helpers in `core.ts` and re-export `writeStatusSnapshot` for CLI compatibility.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
