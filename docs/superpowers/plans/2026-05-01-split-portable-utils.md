# Split Portable Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `core/node/src/core.ts` size by moving portable path, environment, data write, and launcher log helpers into a focused module.

**Architecture:** Create `core/node/src/portable.ts` for root resolution, relative path resolution, process-local portable environment variables, data writability checks, and launcher log writes. `core.ts` imports these helpers and re-exports the public ones so CLI behavior remains compatible.

**Tech Stack:** TypeScript, Node.js filesystem/path APIs, Python `unittest` integration tests.

---

### Task 1: Portable Utilities Module

**Files:**
- Create: `core/node/src/portable.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run focused tests that cover root/env resolution, setup data writability, start logs, and log tail behavior before changing code.

- [x] **Step 2: Extract portable helpers**

Move `getRoot`, `resolveRelative`, `portableEnv`, `dataWritable`, and `writeLog` into `portable.ts`.

- [x] **Step 3: Re-export public helpers**

Re-export `getRoot`, `portableEnv`, and `dataWritable` from `core.ts` so existing CLI imports keep working.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
