# Status Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the latest `status` result to `data/tmp/status.json` for external tools and future portal refresh logic.

**Architecture:** Keep `status -Json` output compatible and add a snapshot write in the CLI status path. The snapshot contains the same status payload plus a generated timestamp and is written under the portable data directory.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Python `unittest` integration tests.

---

### Task 1: Status Snapshot File

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Assert `status -Json` creates `data/tmp/status.json` and that the snapshot contains generated timestamp, root, services, and health fields.

- [x] **Step 2: Implement snapshot writer**

Add a TypeScript helper that writes JSON to `data/tmp/status.json` with parent directory creation.

- [x] **Step 3: Wire CLI status**

Call the snapshot writer from the `status` action before printing output.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
