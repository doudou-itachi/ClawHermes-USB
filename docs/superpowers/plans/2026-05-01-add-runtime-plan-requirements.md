# Add Runtime Plan Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Include adapter runtime version requirements in `runtimes --json` so runtime preparation surfaces service-specific version blockers.

**Architecture:** Reuse `adapterRuntimeRequirementDiagnostics` from runtime diagnostics and include it in `runtimePreparationPlan` output without mutating runtime installation behavior.

**Tech Stack:** TypeScript runtime helpers, Python `unittest`, Markdown progress tracking.

---

### Task 1: Runtime Plan Requirements

**Files:**
- Modify: `core/node/src/runtimes.ts`
- Modify: `core/node/dist/runtimes.js`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing test**

Assert that `runtimes --json` includes Hermes Web UI's Node `>=23.0.0` requirement.

- [x] **Step 2: Add requirements to runtime plan**

Load adapters and include `adapterRuntimeRequirements` in `runtimePreparationPlan`.

- [x] **Step 3: Document progress**

Update `docs/PROGRESS.md` with the change and validation.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and UTF-8 smoke check before committing.
