# Structured Status Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `status -Json` with process metadata and structured health summaries for adapters and the local portal.

**Architecture:** Extend `ServiceStatus` rather than adding a separate command. Existing fields stay compatible; new fields add `processId`, `placeholder`, and `health` so portal and diagnostics can consume one status shape.

**Tech Stack:** TypeScript, Node.js, Python `unittest` integration tests.

---

### Task 1: Structured Health Fields

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/types.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Extend placeholder and managed process status tests to assert `processId`, `placeholder`, and `health` fields.

- [x] **Step 2: Extend status model**

Add health metadata to adapter and portal status objects while keeping existing fields unchanged.

- [x] **Step 3: Preserve portal rendering**

Ensure portal generation still renders service rows using the enriched status shape.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
