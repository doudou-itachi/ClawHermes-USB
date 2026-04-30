# WSL2 Managed Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `start-adapter hermes-agent --confirm-start` launch a WSL2 adapter as a managed Windows-side process and let `stop` terminate it through existing PID metadata.

**Architecture:** Keep WSL command planning in `wsl-adapter.ts`, add a small executable invocation helper so `.cmd` fake WSL scripts can be used in tests, and extend lifecycle startup to accept an explicit process plan. `core.ts` remains the CLI orchestration boundary.

**Tech Stack:** TypeScript + Node.js child process APIs, Python unittest integration tests, fake `.cmd` WSL shim for Windows CI/local verification.

---

### Task 1: Red Test

**Files:**
- Modify: `tests/test_windows_core.py`

- [x] **Step 1: Add fake WSL shim helper**

Create a temporary `.cmd` shim that responds to `--status`, `--list --verbose`, records launch args, writes a marker, and stays alive until killed.

- [x] **Step 2: Add managed start/stop test**

Assert `start-adapter hermes-agent --confirm-start --json` launches through the fake WSL shim, writes non-placeholder metadata, records WSL runner metadata, appears in `status`, and is killed by `stop`.

- [x] **Step 3: Verify red**

Run the new test and confirm it fails because WSL2 start supervision is still explicitly unimplemented.

### Task 2: Implementation

**Files:**
- Modify: `core/node/src/wsl.ts`
- Modify: `core/node/src/wsl-adapter.ts`
- Modify: `core/node/src/lifecycle.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/types.ts`

- [x] **Step 1: Add executable invocation helper**

Expose a helper that returns `{ executablePath, args }`, wrapping `.cmd/.bat` with `cmd.exe /d /s /c` while preserving real executable invocation.

- [x] **Step 2: Add WSL managed launch metadata**

Launch WSL with the planned executable and args, write normal managed process metadata plus `runner: "wsl2"` and WSL command details.

- [x] **Step 3: Wire `startSingleAdapter`**

Replace the current unimplemented WSL2 start error with managed launch through the lifecycle helper after readiness checks pass.

### Task 3: Documentation and Verification

**Files:**
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/PROGRESS.md`
- Build: `core/node/dist/`

- [x] **Step 1: Document WSL2 managed start behavior**

Record that Windows-side PID metadata tracks the `wsl.exe` process and stop terminates that managed process tree.

- [x] **Step 2: Verify**

Run targeted tests, full `npm test`, whitespace check, focused UTF-8 check, and C temp cleanup check.

- [x] **Step 3: Commit**

Commit as:

```text
feat: launch WSL2 adapters as managed processes (feat: 以受管进程启动 WSL2 适配器)
```
