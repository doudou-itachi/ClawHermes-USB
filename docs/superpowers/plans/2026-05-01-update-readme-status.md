# Update README Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update user-facing README files so they match the implemented TypeScript/Node launcher and fix the corrupted Chinese README text.

**Architecture:** Keep README content concise. English and Chinese READMEs should describe the current implemented skeleton, command entry points, and remaining upstream integration gap.

**Tech Stack:** Markdown, UTF-8 text verification.

---

### Task 1: README Refresh

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Update English README**

Describe the current TypeScript/Node core, Batch/PowerShell launchers, backup command, portal, and test workflow.

- [x] **Step 2: Rewrite Chinese README**

Replace mojibake with readable UTF-8 Chinese content matching the English README.

- [x] **Step 3: Verify and commit**

Run markdown diff checks, `git diff --check`, and the UTF-8 smoke check before committing.
