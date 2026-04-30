# Document Adapter Guidance Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the new `adapters` CLI action in user-facing and adapter-focused documentation.

**Architecture:** Update English and Chinese README command examples, then add an adapter preparation command section to the English and Chinese adapter contract documents.

---

### Task 1: Document Adapter Guidance

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/ADAPTER_CONTRACT.zh-CN.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Update README command examples**

Add `adapters --json` and a one-adapter example to both README files.

- [x] **Step 2: Update adapter contract docs**

Describe how contributors should use the `adapters` command before marking real integration ready.

- [x] **Step 3: Verify and commit**

Run `git diff --check`, the UTF-8 smoke check, and targeted Chinese mojibake scans before committing.
