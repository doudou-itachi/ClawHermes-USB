# Add Adapter Runtime Version Requirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record adapter-specific runtime version requirements discovered during real upstream checkout inspection.

**Architecture:** Extend the adapter runtime contract with optional `versionRequirement`. Record Hermes Web UI's upstream `package.json` requirement `>=23.0.0`.

**Tech Stack:** JSON descriptors, TypeScript schema type, Markdown docs, Python `unittest`.

---

### Task 1: Runtime Version Requirement Metadata

**Files:**
- Modify: `adapters/hermes-web-ui/adapter.json`
- Modify: `core/node/src/types.ts`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/ADAPTER_CONTRACT.zh-CN.md`
- Modify: `docs/PROGRESS.md`
- Modify: `tests/test_windows_core.py`

- [x] **Step 1: Add failing test**

Assert that adapter guidance reports Hermes Web UI runtime `versionRequirement`.

- [x] **Step 2: Add metadata**

Add optional TypeScript field and update Hermes Web UI adapter descriptor.

- [x] **Step 3: Document contract and progress**

Document the field and record the upstream lab finding.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, UTF-8 smoke check, and Chinese mojibake scans before committing.
