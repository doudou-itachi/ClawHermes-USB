# WSL2 Workflow Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `wsl-workflow <service-id>` command that ties WSL2 preparation, setup, start, verification, and readiness marking into one explicit operator checklist.

**Architecture:** Add a focused workflow planner module that consumes adapter metadata and WSL diagnostics but never mutates host or project state. Expose the planner through `core.ts` and the CLI.

**Tech Stack:** TypeScript + Node.js CLI, Python unittest, existing adapter and WSL diagnostics modules.

---

### Task 1: Red Test

**Files:**
- Modify: `tests/test_windows_core.py`

- [x] **Step 1: Add workflow JSON test**

Assert `wsl-workflow hermes-agent --json` returns ordered phases with read-only commands and explicit confirmation commands.

- [x] **Step 2: Verify red**

Run the new test and confirm it fails because the command does not exist.

### Task 2: Implementation

**Files:**
- Create: `core/node/src/wsl-workflow.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Build: `core/node/dist/`

- [x] **Step 1: Add workflow planner**

Return service id, display name, distro, current WSL readiness, and ordered phases.

- [x] **Step 2: Add CLI action**

Expose `node core/node/dist/clawhermes.js wsl-workflow hermes-agent --json` and text output.

### Task 3: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Document workflow command**

Add the command to README and adapter contract.

- [x] **Step 2: Verify**

Run targeted workflow tests, full `npm test`, whitespace check, focused UTF-8 check, and C temp cleanup check.

- [x] **Step 3: Commit**

Commit as:

```text
feat: add WSL2 workflow guide (feat: 添加 WSL2 工作流引导)
```
