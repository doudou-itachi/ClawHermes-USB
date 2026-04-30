# Add Adapter Guidance Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an adapter-focused CLI command that shows preparation status and next steps for each service adapter before real upstream integration.

**Architecture:** Create `core/node/src/adapter-guidance.ts` to build adapter setup plans from adapter descriptors and env diagnostics. Add an `adapters` CLI action that lists all adapters or one adapter by id. Keep service-specific logic in adapter metadata, not hardcoded branches.

**Tech Stack:** TypeScript, Node.js filesystem APIs, PowerShell dispatcher, Python `unittest` JSON assertions.

---

### Task 1: Adapter Guidance Command

**Files:**
- Create: `core/node/src/adapter-guidance.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests for `adapters --json`, `adapters hermes-web-ui --json`, and unknown adapter handling.

- [x] **Step 2: Implement adapter setup plan**

Return app directory existence, env file status, commands, dependencies, integration readiness, and next steps.

- [x] **Step 3: Wire CLI and dispatcher**

Expose `adapters` through the TypeScript CLI and PowerShell `ValidateSet`.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
