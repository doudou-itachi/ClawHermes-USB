# Add Mark Adapter Ready Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded `mark-adapter-ready` command that updates adapter integration metadata only after verifier evidence passes and the operator explicitly confirms.

**Architecture:** Reuse `verifyAdapter` as the gate. Update only `adapters/<service-id>/adapter.json`, preserving existing descriptor content where possible. Require `--confirm-ready` and a non-empty `--summary`.

**Tech Stack:** TypeScript filesystem JSON update, existing verifier, Python `unittest`.

---

### Task 1: Mark Adapter Ready Command

**Files:**
- Add: `core/node/src/adapter-metadata.ts`
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

Add tests for confirmation gating, verifier gating, and successful metadata update.

- [x] **Step 2: Implement metadata updater**

Require verifier pass, confirmation, and summary before writing integration metadata.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `mark-adapter-ready <service-id> --confirm-ready --summary <text>` through the TypeScript CLI and PowerShell `ValidateSet`.

- [x] **Step 4: Document command and progress**

Update README, adapter contract, and `docs/PROGRESS.md`.

- [x] **Step 5: Verify and commit**

Run targeted red/green tests, `npm test`, `git diff --check`, UTF-8 smoke check, and Chinese mojibake scans before committing.
