# Add Runtime Version Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare installed portable runtime versions with adapter `runtime.versionRequirement` during setup diagnostics.

**Architecture:** Extend runtime diagnostics to read executable versions, add adapter runtime requirement diagnostics to setup output, and emit a runtime action when an installed runtime does not satisfy an adapter requirement.

**Tech Stack:** TypeScript runtime helpers, Node.js `execFileSync`, simple `>=x.y.z` semver comparison, Python `unittest`.

---

### Task 1: Runtime Version Diagnostics

**Files:**
- Modify: `core/node/src/runtimes.ts`
- Modify: `core/node/src/diagnostics.ts`
- Modify: `core/node/src/types.ts`
- Modify: `core/node/dist/`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing test**

Add a setup diagnostic test where Hermes Web UI requires Node `>=23.0.0` and a copied Node 22 executable is installed.

- [x] **Step 2: Implement version detection and comparison**

Read runtime executable versions and evaluate adapter `versionRequirement` ranges.

- [x] **Step 3: Emit setup diagnostics and actions**

Return `adapterRuntimeRequirements` and add runtime-version setup actions on mismatches.

- [x] **Step 4: Document progress**

Update `docs/PROGRESS.md`.

- [x] **Step 5: Verify and commit**

Run targeted red/green tests, `npm test`, `git diff --check`, and UTF-8 smoke check before committing.
