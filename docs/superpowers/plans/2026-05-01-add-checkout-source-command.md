# Add Checkout Source Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded `checkout-source` command that can clone one adapter's upstream repository into `apps/` only when explicitly confirmed.

**Architecture:** Reuse adapter upstream metadata from `adapter-guidance.ts`. Keep the command single-adapter only, dry-run by default safe, and refuse actual filesystem/network mutation unless `--confirm-checkout` is passed.

**Tech Stack:** TypeScript, Node.js `child_process.spawnSync`, filesystem guards, Python `unittest` with a local Git repository fixture.

---

### Task 1: Guarded Checkout Source Command

**Files:**
- Modify: `core/node/src/adapter-guidance.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests for missing confirmation, dry-run safety, and confirmed clone from a local Git source repository into a placeholder app directory.

- [x] **Step 2: Implement guarded checkout**

Add a single-adapter checkout helper that refuses non-empty app directories, removes only `.gitkeep` placeholders, runs `git clone`, and returns structured JSON.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `checkout-source <service-id> --confirm-checkout`, plus `--dry-run`, through the TypeScript CLI and PowerShell `ValidateSet`.

- [x] **Step 4: Document progress**

Update `docs/PROGRESS.md` with the feature summary, changed areas, validation, and next steps.

- [x] **Step 5: Verify and commit**

Run targeted red/green tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
