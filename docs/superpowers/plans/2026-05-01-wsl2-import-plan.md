# WSL2 Import Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only WSL2 import planning command for USB/project-local distro storage.

**Architecture:** Add a focused planner that never invokes `wsl.exe`. It computes a default ClawHermes distribution name, project-local install location, expected rootfs artifact path, and official `wsl --import ... --version 2` arguments.

**Tech Stack:** TypeScript + Node.js CLI, Python unittest, Microsoft WSL command semantics.

---

### Task 1: Red Test

**Files:**
- Modify: `tests/test_windows_core.py`

- [x] **Step 1: Add import plan test**

Assert `wsl-import-plan --distro Ubuntu --json` is read-only, reports the rootfs path, install location, command args, host registration warning, and missing artifact state.

- [x] **Step 2: Verify red**

Run the new test and confirm it fails because the command does not exist.

### Task 2: Implementation

**Files:**
- Create: `core/node/src/wsl-import.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Build: `core/node/dist/`

- [x] **Step 1: Add planner**

Return distribution name, source rootfs path, install location, command args, command line, docs URL, and host/project modification flags.

- [x] **Step 2: Add CLI action**

Expose `node core/node/dist/clawhermes.js wsl-import-plan --distro Ubuntu --json`.

### Task 3: Documentation and Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Document import planning**

Clarify that data files can be placed under the USB/project path, but the imported distro still registers on the Windows host.

- [x] **Step 2: Verify**

Run targeted test, full `npm test`, whitespace check, focused UTF-8 check, and C temp cleanup check.

- [x] **Step 3: Commit**

Commit as:

```text
feat: add WSL2 import planning (feat: 添加 WSL2 导入规划)
```
