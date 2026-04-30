# Portal Refresh Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the generated portal refresh service status and health cells from `/status.json` without reloading the page.

**Architecture:** Keep the portal as static HTML. Add `data-service-id` markers and a small inline script that fetches `/status.json`, updates status/health text, and repeats on an interval.

**Tech Stack:** TypeScript-generated HTML, browser Fetch API, Python `unittest` integration tests.

---

### Task 1: Portal Refresh Markup

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Extend portal generation tests to assert service rows have data attributes and the page includes a `/status.json` fetch script.

- [x] **Step 2: Add stable row/cell markers**

Add `data-service-id`, `data-status-cell`, `data-health-label`, and `data-health-reason` attributes.

- [x] **Step 3: Add refresh script**

Add a small inline script that fetches `/status.json`, updates matching rows, and schedules repeated refreshes.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
