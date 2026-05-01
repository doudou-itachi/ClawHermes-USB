# WSL2 Graceful Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a WSL2 adapter's declared stop command inside the target distro before terminating the Windows-side managed `wsl.exe` process tree.

**Architecture:** Extend the generic WSL adapter command planner to support the `stop` phase, then let lifecycle stop invoke the WSL2 stop hook for managed WSL2 metadata before PID-tree termination. Stop remains best-effort so stale or failed hooks do not prevent cleanup.

**Tech Stack:** TypeScript + Node.js `spawnSync`, existing WSL adapter planner, Python unittest fake WSL shim.

---

### Task 1: Red Test

**Files:**
- Modify: `tests/test_windows_core.py`

- [x] **Step 1: Extend fake WSL shim**

Allow fake WSL to detect a `WSL_STOP_HOOK` marker in arguments, write a stop marker, and exit instead of entering the long-running loop.

- [x] **Step 2: Add graceful stop test**

Configure Hermes Agent's temporary adapter with `commands.stop = "echo WSL_STOP_HOOK"`, start through fake WSL, call `stop`, and assert the stop marker was written before PID cleanup.

- [x] **Step 3: Verify red**

Run the new test and confirm it fails because lifecycle stop does not run WSL2 stop hooks yet.

### Task 2: Implementation

**Files:**
- Modify: `core/node/src/wsl-adapter.ts`
- Modify: `core/node/src/lifecycle.ts`
- Build: `core/node/dist/`

- [x] **Step 1: Support stop phase in WSL command planner**

Allow `wslAdapterCommandPlan(..., "stop")` to build the same WSL command shape for `commands.stop`.

- [x] **Step 2: Run WSL stop hook before kill**

In `stopAdapter`, when PID metadata says `runner: "wsl2"` and the adapter declares `commands.stop`, run the stop hook through WSL using the same executable invocation wrapper. Append outcome to the service log and continue to process termination even if the hook fails.

### Task 3: Documentation and Verification

**Files:**
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Document WSL2 stop hook behavior**

Record best-effort WSL2 in-distro stop semantics.

- [x] **Step 2: Verify**

Run targeted graceful stop tests, full `npm test`, whitespace check, focused UTF-8 check, and C temp cleanup check.

- [x] **Step 3: Commit**

Commit as:

```text
feat: add WSL2 graceful stop hooks (feat: 添加 WSL2 优雅停止钩子)
```
