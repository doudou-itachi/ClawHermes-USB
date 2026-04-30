# Portal Status Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the latest status snapshot from the local portal at `/status.json`.

**Architecture:** `start` writes an initial `data/tmp/status.json` after the portal process starts. The lightweight portal server serves `/status.json` directly from that file with JSON content type, leaving the static portal page unchanged.

**Tech Stack:** TypeScript, Node.js HTTP server, Python `unittest` integration tests.

---

### Task 1: Portal Status JSON

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/portal-server.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Extend the portal lifecycle test to fetch `http://127.0.0.1:17000/status.json` after start and verify it contains generated status data.

- [x] **Step 2: Write initial snapshot on start**

After the portal server starts, write a fresh status snapshot under `data/tmp/status.json`.

- [x] **Step 3: Serve `/status.json`**

Add a portal server route that serves the snapshot as `application/json; charset=utf-8`, returning 503 if it does not exist yet.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
