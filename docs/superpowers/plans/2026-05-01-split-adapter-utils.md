# Split Adapter Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move adapter loading, validation, integration readiness, and service ordering out of the monolithic core module.

**Architecture:** Create `core/node/src/adapters.ts` for adapter descriptor discovery and adapter-derived ordering. `core.ts` imports these helpers and keeps its existing public behavior unchanged.

**Tech Stack:** TypeScript, Node.js filesystem/path APIs, Python `unittest` integration tests.

---

### Task 1: Adapter Utilities Module

**Files:**
- Create: `core/node/src/adapters.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run tests covering adapter validation, readiness messages, service ordering, and managed fake adapters before changing code.

- [x] **Step 2: Extract adapter helpers**

Move `loadAdapters`, `validateAdapter`, `integrationReadiness`, and `serviceOrder` to `adapters.ts`.

- [x] **Step 3: Re-export public helpers**

Re-export the public adapter helper functions from `core.ts` for compatibility.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
