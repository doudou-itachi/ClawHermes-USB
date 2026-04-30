# Promote Hermes Web UI Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for lifecycle behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the successful disposable-lab Hermes Web UI verification and make the default launcher robust when a verified adapter's app payload is not checked out yet.

**Architecture:** Keep `integration.productionReady` as a statement that the adapter contract has been verified with a real payload. At runtime, managed process launch still requires the current USB root to contain a real app directory; placeholder-only app directories remain placeholder starts until the payload is checked out.

**Tech Stack:** TypeScript lifecycle guard, adapter metadata, Python `unittest`, project docs.

---

### Task 1: Runtime Guard And Metadata Promotion

**Files:**
- Modify: `core/node/src/lifecycle.ts`
- Modify: `core/node/dist/lifecycle.js`
- Modify: `adapters/hermes-web-ui/adapter.json`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing lifecycle guard test**

Add a test proving a production-ready adapter with a placeholder-only app directory does not launch a managed process from an empty checkout target.

- [x] **Step 2: Implement app-dir launch guard**

Require real app directory content before managed adapter startup, while keeping `start-adapter --confirm-start` usable in checked-out lab roots.

- [x] **Step 3: Promote Hermes Web UI metadata**

Update Hermes Web UI integration metadata with disposable-lab evidence from checkout, setup, start, HTTP 200, and `productionReadyCandidate: true`.

- [x] **Step 4: Update expectations and progress docs**

Update tests and progress notes for the verified Hermes Web UI adapter and remaining placeholder behavior in roots without checked-out app payloads.

- [x] **Step 5: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and UTF-8 smoke check before committing.
