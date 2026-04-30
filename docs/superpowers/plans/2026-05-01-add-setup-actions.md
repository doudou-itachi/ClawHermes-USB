# Add Setup Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and superpowers:verification-before-completion before committing. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make setup diagnostics more actionable by returning structured next-step guidance in addition to existing messages.

**Architecture:** Extend `setupDiagnostics` with an `actions` array. Each action describes the category, severity, title, detail, and optional command/docs/source path. Keep current `messages` behavior for compatibility. Update the CLI text output to print recommended actions after messages.

**Tech Stack:** TypeScript, Node.js CLI, Python `unittest` JSON assertions.

---

### Task 1: Setup Actions

**Files:**
- Modify: `core/node/src/diagnostics.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/node/src/types.ts`
- Modify: `tests/test_windows_core.py`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Add failing tests**

Add tests asserting setup JSON includes actions for missing runtimes, blocked/candidate adapters, and missing env files.

- [x] **Step 2: Implement setup actions**

Build structured actions from runtime diagnostics, adapter readiness, env file diagnostics, port conflicts, missing paths, and data writability.

- [x] **Step 3: Wire CLI text output**

Print recommended actions in non-JSON setup output without changing JSON structure beyond adding `actions`.

- [x] **Step 4: Verify and commit**

Run targeted tests, `npm test`, `git diff --check`, and the UTF-8 smoke check before committing.
