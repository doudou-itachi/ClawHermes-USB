# Add Verify Adapter Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `verify-adapter` command that reports whether one adapter has enough evidence to be considered a production-ready candidate.

**Architecture:** Add a focused verifier module that loads one adapter, checks app directory readiness, setup command evidence, start command readiness, env files, and health behavior. Do not modify adapter metadata.

**Tech Stack:** TypeScript, Node.js filesystem checks, existing adapter/env/status helpers, Python `unittest`.

---

### Task 1: Verify Adapter Command

**Files:**
- Add: `core/node/src/adapter-verification.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `tests/test_windows_core.py`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/ADAPTER_CONTRACT.zh-CN.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests for missing setup evidence, passing process-adapter verification after confirmed setup, and unknown adapter errors.

- [x] **Step 2: Implement verifier**

Return structured checks and `productionReadyCandidate` without leaking secret values or mutating adapter metadata.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `verify-adapter <service-id>` through the TypeScript CLI and PowerShell `ValidateSet`.

- [x] **Step 4: Document command and progress**

Update README, adapter contract, and `docs/PROGRESS.md`.

- [x] **Step 5: Verify and commit**

Run targeted red/green tests, `npm test`, `git diff --check`, UTF-8 smoke check, and Chinese mojibake scans before committing.
