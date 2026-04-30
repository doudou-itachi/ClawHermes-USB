# WSL2 Preparation Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded `prepare-wsl` command that explains and optionally runs explicit host-level WSL preparation for Hermes Agent.

**Architecture:** Reuse `wslDiagnostics` for current state, add a focused WSL preparation planner in `core/node/src/wsl.ts`, expose it through `core.ts`, and add CLI parsing in `clawhermes.ts`. The command must default to dry planning and require `--confirm-install` before any host-level command execution.

**Tech Stack:** TypeScript + Node.js core CLI, Python unittest integration tests, Microsoft WSL command semantics.

---

### Task 1: Red Tests

**Files:**
- Modify: `tests/test_windows_core.py`

- [x] **Step 1: Add dry-run and guard tests**

Add tests that call `prepare-wsl --distro Ubuntu --dry-run --json` with a missing `CLAWHERMES_WSL_EXE`, then assert the result is read-only, includes `wsl.exe --install -d Ubuntu`, marks host changes, and includes the portable import limitation.

- [x] **Step 2: Add confirmation guard test**

Add a test that calls `prepare-wsl --distro Ubuntu --json` without `--confirm-install` and expects a non-zero result with a confirmation error.

- [x] **Step 3: Verify tests fail**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.WindowsCoreTests.test_prepare_wsl_dry_run_reports_guarded_host_install_plan tests.test_windows_core.WindowsCoreTests.test_prepare_wsl_requires_confirm_install_without_dry_run -v
```

Expected: fail because `prepare-wsl` is not implemented.

### Task 2: Planner Implementation

**Files:**
- Modify: `core/node/src/types.ts`
- Modify: `core/node/src/wsl.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`

- [x] **Step 1: Add WSL preparation result types**

Add small types for preparation commands and results. Include `hostChanges`, `portableImport`, `commands`, `executed`, and `messages`.

- [x] **Step 2: Implement preparation planner**

Add `prepareWsl` that:

- uses `wslDiagnostics(root, distro)`;
- builds `wsl.exe --install -d <distro>` when the target distro is missing;
- builds `wsl.exe --set-version <distro> 2` when the target distro exists but is not WSL2;
- records that enabling WSL2 and registering distros are host-level changes;
- refuses non-dry-run unless `confirmInstall` is true;
- leaves actual execution narrowly scoped to the planned command list.

- [x] **Step 3: Expose CLI command**

Add `prepare-wsl` to `clawhermes.ts`, parse `--confirm-install`, and print JSON or concise text.

### Task 3: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/ADAPTER_CONTRACT.md`
- Modify: `docs/PROGRESS.md`
- Modify: `AGENT.md`

- [x] **Step 1: Document the command**

Add `prepare-wsl --distro Ubuntu --dry-run --json` to quick start and document that real host changes require `--confirm-install`.

- [x] **Step 2: Verify Chinese examples in `AGENT.md`**

Confirm the Chinese commit examples are readable UTF-8 before committing this phase.

- [x] **Step 3: Record progress**

Add a WSL2 preparation command entry with validation commands and next steps.

### Task 4: Verification and Commit

**Files:**
- Build output: `core/node/dist/`

- [x] **Step 1: Run targeted tests**

Run the two new tests and related WSL tests.

- [x] **Step 2: Run full tests**

Run `npm test`.

- [x] **Step 3: Run hygiene checks**

Run `git diff --check`, UTF-8 mojibake smoke, and C temp cleanup check.

- [x] **Step 4: Commit**

Commit as:

```text
feat: add guarded WSL preparation command (feat: 添加受保护 WSL 准备命令)
```
