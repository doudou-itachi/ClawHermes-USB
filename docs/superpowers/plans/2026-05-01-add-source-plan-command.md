# Add Source Plan Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only app source preparation command that shows where upstream repositories should be checked out without mutating `apps/`.

**Architecture:** Extend `adapter-guidance.ts` with an `appSourcePlan` function based on adapter `upstream` metadata. Add a `sources` CLI action that lists all source checkout targets or one adapter by id. The command must report `wouldModify: false`.

**Tech Stack:** TypeScript, Node.js filesystem APIs, PowerShell dispatcher, Python `unittest` JSON assertions.

---

### Task 1: Source Plan Command

**Files:**
- Modify: `core/node/src/adapter-guidance.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests for `sources --json`, `sources hermes-web-ui --json`, and unknown adapter handling.

- [x] **Step 2: Implement source plan**

Return app directory readiness, upstream repository metadata, target path, checkout command, and `wouldModify: false`.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `sources` through the TypeScript CLI and PowerShell `ValidateSet`.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
