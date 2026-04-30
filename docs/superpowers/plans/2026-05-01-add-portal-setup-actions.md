# Add Portal Setup Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show setup recommended actions in the local portal so startup blockers are visible without opening JSON output.

**Architecture:** Write the setup diagnostics result to `data/tmp/setup.json` during `start`. Add a read-only `/setup.json` endpoint to the portal server. Update the generated portal HTML to render recommended actions from the snapshot. Use a snapshot instead of live recomputation to avoid the running portal server making port 17000 look like a new conflict.

**Tech Stack:** TypeScript, Node.js filesystem/HTTP APIs, Python `unittest` integration tests.

---

### Task 1: Portal Setup Actions

**Files:**
- Modify: `core/node/src/diagnostics.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/portal-server.ts`
- Modify: `core/node/src/portal.ts`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests verifying `start` writes `data/tmp/setup.json`, `/setup.json` serves it, and the portal HTML includes a setup actions section.

- [x] **Step 2: Write setup snapshot**

Add a diagnostics helper that writes setup diagnostics to `data/tmp/setup.json`, and call it from `startSkeleton`.

- [x] **Step 3: Serve and render setup actions**

Add `/setup.json` to the portal server and update the generated portal HTML JavaScript to show recommended actions.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
