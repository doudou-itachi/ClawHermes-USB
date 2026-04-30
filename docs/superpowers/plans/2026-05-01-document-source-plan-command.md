# Document Source Plan Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Document the read-only `sources` command in the user-facing README files and adapter contract.

**Architecture:** Keep this phase docs-only. Do not change command behavior.

**Tech Stack:** Markdown, UTF-8 Chinese documentation, Git diff validation.

---

### Task 1: Source Plan Documentation

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/ADAPTER_CONTRACT.zh-CN.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add README examples**

Add all-adapter and single-adapter `sources --json` examples.

- [x] **Step 2: Document contract behavior**

Document that the command is read-only, reports checkout targets, and must not be treated as an automatic installer.

- [x] **Step 3: Update contributor workflow**

Require `sources <new-service> --json` before real upstream integration work.

- [x] **Step 4: Verify and commit**

Run Markdown review, `git diff --check`, UTF-8 smoke check, and Chinese mojibake scans before committing.
