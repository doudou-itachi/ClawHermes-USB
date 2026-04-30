# Split Portal Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move portal HTML generation and portal process lifecycle helpers out of the main core module.

**Architecture:** Create `core/node/src/portal.ts` for `PORTAL_URL`, portal HTML generation, portal server process discovery, start/stop, and portal status. `core.ts` passes current service status into portal generation to avoid a circular dependency.

**Tech Stack:** TypeScript, Node.js HTTP/process/filesystem APIs, Python `unittest` integration tests.

---

### Task 1: Portal Utilities Module

**Files:**
- Create: `core/node/src/portal.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run tests covering portal generation, portal HTTP serving, portal PID cleanup, and occupied portal port handling before changing code.

- [x] **Step 2: Extract portal helpers**

Move portal HTML generation and portal process helpers into `portal.ts`.

- [x] **Step 3: Wire core orchestration**

Update `startSkeleton`, `getStatus`, and `stopSkeleton` to call portal module functions while preserving public exports.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
