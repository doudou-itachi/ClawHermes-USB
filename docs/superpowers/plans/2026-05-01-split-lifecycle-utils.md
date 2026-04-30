# Split Lifecycle Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move adapter start/stop lifecycle helpers and process tree termination out of the main core module.

**Architecture:** Create `core/node/src/lifecycle.ts` for adapter start metadata creation, managed process launch, placeholder logging, adapter stop handling, and generic process tree termination. `core.ts` keeps high-level start/status/stop orchestration. `portal.ts` imports the shared process tree helper instead of owning a duplicate process concern.

**Tech Stack:** TypeScript, Node.js process/filesystem APIs, Python `unittest` integration tests.

---

### Task 1: Lifecycle Utilities Module

**Files:**
- Create: `core/node/src/lifecycle.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/portal.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run tests covering placeholder start/stop, managed adapter process launch/stop, stale managed PID cleanup, and portal stop behavior before changing code.

- [x] **Step 2: Extract lifecycle helpers**

Move adapter start metadata creation, managed process launch, placeholder log writing, adapter stop handling, and process tree termination into `lifecycle.ts`.

- [x] **Step 3: Wire core and portal**

Update `core.ts` to call lifecycle helpers and update `portal.ts` to use the shared process tree helper.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
