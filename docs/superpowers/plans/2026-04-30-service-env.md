# Service Env Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve adapter service environments from portable defaults, local env files, and inline adapter variables without exposing secret values in diagnostics.

**Architecture:** Add TypeScript helpers for `.env` parsing and per-service environment resolution. Expose a redacted `service-env` diagnostic command that reports loaded files and variable names only; the internal resolved environment can later be reused by real process launch.

**Tech Stack:** TypeScript, Node.js, Windows PowerShell wrapper, Python `unittest` integration tests.

---

### Task 1: Redacted Service Environment Diagnostics

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/types.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Add tests that create a temporary env file with secret-like values, call `service-env <adapter> -Json`, and verify the output reports variable names and loaded file metadata without printing the secret values.

- [x] **Step 2: Implement env parsing and merging**

Parse simple `.env` lines, merge portable env first, env file values second, and adapter inline variables last. Resolve `${USB_ROOT}` in inline adapter variables.

- [x] **Step 3: Wire redacted diagnostics**

Expose `service-env` in the Node CLI and PowerShell dispatcher. Return variable names, loaded file metadata, missing file metadata, and messages, but no secret values.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
