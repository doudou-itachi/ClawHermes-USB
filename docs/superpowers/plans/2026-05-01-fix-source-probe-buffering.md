# Fix Source Probe Buffering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:systematic-debugging and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `probe-sources` so large upstream repositories do not fail with `spawnSync git ENOBUFS`.

**Root Cause:** The initial implementation ran `git ls-remote <repo>` for reachability, which can produce more output than Node's default spawn buffer for repositories with many refs.

**Fix:** Probe `HEAD` with `git ls-remote --exit-code <repo> HEAD` for reachability, then probe the declared checkout ref separately with `git ls-remote --exit-code <repo> <ref>`.

---

### Task 1: Bounded Source Probe

**Files:**
- Modify: `core/node/src/adapter-guidance.ts`
- Modify: `core/node/dist/adapter-guidance.js`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Reproduce**

Run real `probe-sources --json` and observe `spawnSync git ENOBUFS` for large upstream repositories.

- [x] **Step 2: Fix bounded refs**

Change reachability probing to `HEAD` and keep checkout ref probing separate.

- [x] **Step 3: Verify and record**

Run targeted tests, real upstream probe, `npm test`, `git diff --check`, UTF-8 smoke check, and update progress before committing.
