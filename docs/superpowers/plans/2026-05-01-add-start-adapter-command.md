# Add Start Adapter Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded `start-adapter` command for launching one adapter in integration labs before it is marked production-ready.

**Architecture:** Keep normal `start` behavior unchanged. Add a single-adapter path that requires `--confirm-start` for real startup and supports `--dry-run`. Reuse the managed process lifecycle and write standard PID metadata.

**Tech Stack:** TypeScript lifecycle/core CLI changes, PowerShell dispatcher, Python `unittest`.

---

### Task 1: Guarded Start Adapter Command

**Files:**
- Modify: `core/node/src/lifecycle.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `core/node/dist/`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests for confirmation gating, dry-run safety, and confirmed launch of a candidate fake adapter.

- [x] **Step 2: Implement forced single-adapter startup**

Allow integration startup to launch one adapter through managed lifecycle without changing production-ready metadata.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `start-adapter <service-id> --confirm-start` and `--dry-run`.

- [x] **Step 4: Document progress**

Update `docs/PROGRESS.md`.

- [x] **Step 5: Verify and commit**

Run targeted red/green tests, `npm test`, `git diff --check`, and UTF-8 smoke check before committing.
