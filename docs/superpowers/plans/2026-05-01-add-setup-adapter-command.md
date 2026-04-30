# Add Setup Adapter Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded `setup-adapter` command that can run one adapter's setup command after source checkout, using the same dry-run and explicit-confirmation pattern as source checkout.

**Architecture:** Add setup execution in a focused TypeScript module. Resolve the adapter environment through existing env handling, run the command from `appDir`, expose variable names rather than secret values, and refuse actual execution unless `--confirm-setup` is passed.

**Tech Stack:** TypeScript, Node.js `child_process.spawnSync`, Python `unittest` with a local fake adapter setup script.

---

### Task 1: Guarded Setup Adapter Command

**Files:**
- Add: `core/node/src/adapter-setup.ts`
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

Add tests for missing confirmation, dry-run safety, and confirmed setup execution using a local fake adapter.

- [x] **Step 2: Implement setup runner**

Resolve adapter env, validate app directory readiness, run the setup command from `appDir`, and return structured JSON without secret values.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `setup-adapter <service-id> --confirm-setup`, plus `--dry-run`, through the TypeScript CLI and PowerShell `ValidateSet`.

- [x] **Step 4: Document command and progress**

Update README, adapter contract, and `docs/PROGRESS.md`.

- [x] **Step 5: Verify and commit**

Run targeted red/green tests, `npm test`, `git diff --check`, UTF-8 smoke check, and Chinese mojibake scans before committing.
