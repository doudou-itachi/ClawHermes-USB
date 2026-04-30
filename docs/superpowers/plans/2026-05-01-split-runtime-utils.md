# Split Runtime Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move runtime manifest diagnostics, preparation planning, checksum verification, and archive installation out of the monolithic core module.

**Architecture:** Create `core/node/src/runtimes.ts` for all runtime-manifest-based behavior. `core.ts` imports and re-exports the public runtime functions used by the CLI.

**Tech Stack:** TypeScript, Node.js filesystem/crypto APIs, PowerShell `Expand-Archive`, Python `unittest` integration tests.

---

### Task 1: Runtime Utilities Module

**Files:**
- Create: `core/node/src/runtimes.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run tests covering runtime diagnostics, preparation plan, archive dry-run, extraction, and SHA256 validation before changing code.

- [x] **Step 2: Extract runtime helpers**

Move `runtimeDiagnostics`, `loadRuntimeManifest`, `runtimePreparationPlan`, `installRuntimeFromArchive`, and private copy/checksum helpers to `runtimes.ts`.

- [x] **Step 3: Re-export public helpers**

Re-export public runtime functions from `core.ts` for compatibility.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
