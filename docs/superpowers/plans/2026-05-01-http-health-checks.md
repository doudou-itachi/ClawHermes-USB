# HTTP Health Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `status -Json` run lightweight HTTP checks for HTTP adapters so a running process is only marked healthy when its endpoint responds.

**Architecture:** Keep `getStatus` synchronous and enrich existing `health` output. Process health remains based on pid liveness; HTTP health uses the adapter's `health.url` and timeout, returning ready only for a reachable 2xx or 3xx endpoint.

**Tech Stack:** TypeScript, Node.js, PowerShell HTTP probe for synchronous status, Python `unittest` integration tests.

---

### Task 1: HTTP Adapter Health

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/types.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Create a temporary production-ready HTTP adapter that starts a local Node HTTP server. Verify `status -Json` reports `health.ready == true` when the endpoint responds and `health.ready == false` when a stale running pid points to an unreachable URL.

- [x] **Step 2: Implement HTTP health probe**

Add a synchronous localhost HTTP probe with timeout handling. Treat 2xx and 3xx as ready; report unreachable or non-success statuses as not ready.

- [x] **Step 3: Keep process/placeholder behavior stable**

Ensure existing process health and placeholder health tests keep passing.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
