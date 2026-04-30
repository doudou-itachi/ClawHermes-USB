# Add Adapter Upstream Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make upstream source and installation metadata explicit in adapter descriptors and adapter guidance output.

**Architecture:** Add an optional `upstream` object to the adapter descriptor schema. Include repository URL, install docs URL, checkout ref, install mode, and notes. Update adapter guidance to expose the upstream metadata and distinguish a present app directory from a prepared app directory containing real files beyond placeholders.

**Tech Stack:** TypeScript, JSON adapter descriptors, Python `unittest` JSON assertions.

---

### Task 1: Upstream Metadata

**Files:**
- Modify: `adapters/*/adapter.json`
- Modify: `core/node/src/types.ts`
- Modify: `core/node/src/adapter-guidance.ts`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/ADAPTER_CONTRACT.zh-CN.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests asserting adapter guidance includes upstream metadata and reports placeholder-only app directories as not prepared.

- [x] **Step 2: Update descriptors and TypeScript schema**

Add `upstream` metadata to the default adapters and type it in `AdapterDescriptor`.

- [x] **Step 3: Update adapter guidance**

Expose `upstream`, add `appDirReady`, and include checkout/install next steps.

- [x] **Step 4: Update docs, verify, and commit**

Update adapter contract docs, run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
