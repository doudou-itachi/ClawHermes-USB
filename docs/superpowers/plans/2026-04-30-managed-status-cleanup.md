# Managed Status Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `status` accurate for managed adapter processes by removing stale pid files when the recorded process no longer exists.

**Architecture:** Extend adapter status evaluation to inspect non-placeholder pid metadata. Placeholder services keep their existing metadata-based behavior, while managed processes must have a live process id to remain `running`.

**Tech Stack:** TypeScript, Node.js process checks, Python `unittest` integration tests.

---

### Task 1: Managed Adapter Status Cleanup

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Create a temporary fake adapter root with a stale managed pid file. Verify `status -Json` reports the adapter as stopped and removes the pid file.

- [x] **Step 2: Implement process-aware status**

Add a generic process existence check and use it for non-placeholder adapter metadata in `getStatus`.

- [x] **Step 3: Verify no regressions**

Run tests covering managed process start/stop and placeholder metadata status.

- [x] **Step 4: Verify and commit**

Run `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
