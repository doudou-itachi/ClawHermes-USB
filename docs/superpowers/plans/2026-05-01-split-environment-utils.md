# Split Environment Utilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move env file diagnostics, safe env initialization, `.env` parsing, and service environment resolution out of the monolithic core module.

**Architecture:** Create `core/node/src/environment.ts` for adapter-declared env files and resolved service environments. `core.ts` imports and re-exports public environment functions for CLI compatibility.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Python `unittest` integration tests.

---

### Task 1: Environment Utilities Module

**Files:**
- Create: `core/node/src/environment.ts`
- Modify: `core/node/src/core.ts`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Run baseline tests**

Run tests covering setup env diagnostics, `init-env`, redacted `service-env`, and managed process env injection before changing code.

- [x] **Step 2: Extract environment helpers**

Move `envFileDiagnostics`, `initializeEnvFiles`, `resolveServiceEnvironment`, `serviceEnvironmentDiagnostic`, `.env` parsing, unquoting, and template expansion to `environment.ts`.

- [x] **Step 3: Re-export public helpers**

Re-export public environment functions from `core.ts` for compatibility.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
