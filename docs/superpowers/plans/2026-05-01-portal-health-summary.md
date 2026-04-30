# Portal Health Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show structured service health readiness in the generated local portal.

**Architecture:** Reuse `getStatus` output inside `generatePortal`. Add a health column that displays ready/not ready, health type, and reason while keeping the portal static and dependency-free.

**Tech Stack:** TypeScript, Node.js static HTML generation, Python `unittest` integration tests.

---

### Task 1: Portal Health Column

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Extend portal generation tests to assert a `Health` column and placeholder health reason are rendered.

- [x] **Step 2: Update portal HTML**

Add health status text to each service row with escaped reason text.

- [x] **Step 3: Verify lifecycle behavior**

Run portal generation and portal HTTP lifecycle tests.

- [x] **Step 4: Verify and commit**

Run `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
