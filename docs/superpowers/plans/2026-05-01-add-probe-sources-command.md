# Add Probe Sources Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `probe-sources` command that checks adapter upstream repository reachability and checkout ref availability before clone/setup work.

**Architecture:** Reuse adapter upstream metadata. Run `git ls-remote` without mutating `apps/`. Report one adapter or all adapters with `wouldModify: false`, reachability, checkout ref presence, and concise messages.

**Tech Stack:** TypeScript, Node.js `child_process.spawnSync`, Git, Python `unittest` with a local Git repository fixture.

---

### Task 1: Source Probe Command

**Files:**
- Modify: `core/node/src/adapter-guidance.ts`
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

Add tests for reachable local upstream refs, missing refs, and unknown adapter errors.

- [x] **Step 2: Implement source probing**

Run `git ls-remote` for adapter upstream repositories and report structured read-only results.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `probe-sources [service-id]` through the TypeScript CLI and PowerShell `ValidateSet`.

- [x] **Step 4: Document command and progress**

Update README, adapter contract, and `docs/PROGRESS.md`.

- [x] **Step 5: Verify and commit**

Run targeted red/green tests, `npm test`, `git diff --check`, UTF-8 smoke check, and Chinese mojibake scans before committing.
