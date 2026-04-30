# Log Tail Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe CLI helper for reading recent launcher or service log lines.

**Architecture:** Keep log access constrained to known targets: `launcher` and adapter service IDs. Resolve log paths from adapter metadata or `data/logs/launcher.log`, cap requested line counts, and return structured JSON.

**Tech Stack:** TypeScript, Node.js filesystem APIs, PowerShell thin wrapper, Python `unittest` integration tests.

---

### Task 1: Controlled Log Tail

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Add tests that start placeholder services, call `logs openclaw --lines 1 -Json`, and verify only recent known service log lines are returned. Add an unknown target test.

- [x] **Step 2: Implement log tail helper**

Resolve allowed log targets, cap lines, read UTF-8 text, and return path, exists, requested lines, and tail lines.

- [x] **Step 3: Wire CLI and wrapper**

Add `logs` action and `--lines` parsing while keeping Batch/PowerShell wrappers thin.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
