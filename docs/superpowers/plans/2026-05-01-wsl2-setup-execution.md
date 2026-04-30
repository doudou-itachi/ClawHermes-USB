# WSL2 Setup Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify and harden confirmed WSL2 adapter setup execution without requiring real WSL2 in tests.

**Architecture:** Reuse the WSL executable invocation helper added for managed start. Keep setup execution in `adapter-setup.ts`, but route WSL setup through the same invocation wrapper used by diagnostics and startup.

**Tech Stack:** TypeScript + Node.js `spawnSync`, Python unittest, fake `.cmd` WSL shim.

---

### Task 1: Red Test

**Files:**
- Modify: `tests/test_windows_core.py`

- [x] **Step 1: Extend fake WSL helper**

Allow the fake WSL shim to either stay alive for startup tests or exit successfully for setup tests.

- [x] **Step 2: Add confirmed WSL2 setup test**

Assert `setup-adapter hermes-agent --confirm-setup --json` executes through fake WSL, writes the setup log, records exit code 0, and includes WSL arguments.

- [x] **Step 3: Verify red**

Run the new test and confirm it fails because setup still tries to spawn the `.cmd` shim directly.

### Task 2: Implementation

**Files:**
- Modify: `core/node/src/adapter-setup.ts`
- Build: `core/node/dist/adapter-setup.js`

- [x] **Step 1: Use WSL invocation wrapper**

Import `wslExecutableInvocation` and use it for WSL setup `spawnSync`.

- [x] **Step 2: Preserve reported WSL plan**

Keep JSON output reporting the real WSL executable and real WSL args, not the internal `.cmd` wrapper invocation.

### Task 3: Documentation and Verification

**Files:**
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Document confirmed WSL2 setup**

Record that confirmed WSL2 setup executes through the same WSL adapter plan and logs to `data/logs/setup-<service>.log`.

- [x] **Step 2: Verify**

Run targeted setup/start WSL tests, full `npm test`, whitespace check, focused UTF-8 check, and C temp cleanup check.

- [x] **Step 3: Commit**

Commit as:

```text
feat: execute WSL2 adapter setup through guarded plan (feat: 通过受保护计划执行 WSL2 适配器设置)
```
