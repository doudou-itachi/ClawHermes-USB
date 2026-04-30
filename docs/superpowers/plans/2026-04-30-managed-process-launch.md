# Managed Process Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe supervised process launch path for adapters whose native Windows command has been explicitly verified.

**Architecture:** Keep existing OpenClaw/Hermes adapters in placeholder mode because their integration metadata is not production-ready. Add a real launch path only when `integration.productionReady` is true and the adapter has a start command. Metadata records process id and redacted environment summary; stop kills managed process trees.

**Tech Stack:** TypeScript, Node.js child processes, Windows PowerShell wrapper, Python `unittest` integration tests.

---

### Task 1: Production-Ready Adapter Process Launch

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests**

Create a temporary USB root with a fake production-ready adapter whose `node service.js` command writes received env values to a temp file and keeps running. Verify `start` creates running process metadata, the env reaches the child, and `stop` kills the process.

- [x] **Step 2: Implement real launch path**

When an adapter is production-ready and has a start command, spawn it detached with the resolved service environment, working directory, and service log redirection. Keep non-production adapters on placeholder metadata.

- [x] **Step 3: Implement managed stop**

When a pid file records a non-placeholder process id, stop should kill that process tree before removing metadata.

- [x] **Step 4: Verify existing placeholders**

Ensure current OpenClaw/Hermes adapters still start as placeholders because their integration metadata is not production-ready.

- [x] **Step 5: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
