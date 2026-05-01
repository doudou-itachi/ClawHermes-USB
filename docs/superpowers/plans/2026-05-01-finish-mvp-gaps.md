# Finish MVP Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining MVP gaps: payload packaging, current-root Hermes Web UI verification, clean upstream payload state, automatic port remapping, setup wizard, and release guidance.

**Architecture:** Keep state-changing operations explicit and guarded. Add read-only planning before archive/export actions, keep generated payloads under `data/backups/`, and keep all ignored payloads out of git. Runtime port remapping will be implemented in the orchestration layer so adapter descriptors remain the source of defaults while start-time assignments can override ports.

**Tech Stack:** TypeScript + Node.js core, thin PowerShell/Batch launchers, Python unittest behavior tests, WSL2 adapter runner.

---

### Task 1: Payload Export

**Files:**
- Create: `core/node/src/payload-export.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Test: `tests/test_windows_core.py`
- Docs: `README.md`, `docs/PROGRESS.md`

- [x] Add a failing test for `payload-export --dry-run --json` reporting selected app/rootfs/backup entries without creating an archive.
- [x] Add a failing test for `payload-export --confirm-export --json` using tiny temporary fixtures and verifying a manifest zip under `data/backups/payloads/`.
- [x] Implement guarded payload export. It must refuse execution unless `--confirm-export` is present, must reject system temp archive overrides outside the project root, and must never include `data/tmp`.
- [x] Build, run focused tests, then commit.

### Task 2: Current-Root Hermes Web UI Verification

**Files:**
- Modify: `adapters/hermes-web-ui/README.md`
- Modify: `docs/upstream-integration.md`
- Modify: `docs/PROGRESS.md`

- [x] Checkout `EKKOLearnAI/hermes-web-ui` into `apps/hermes-web-ui` if it is still placeholder-only.
- [x] Run `setup-adapter hermes-web-ui --confirm-setup --json`.
- [x] Start Hermes Agent and Hermes Web UI, verify `http://127.0.0.1:8648` returns 200, then stop services.
- [x] Update docs with current-root verification evidence and commit.

### Task 3: Clean Hermes Agent Upstream Checkout

**Files:**
- Modify: `docs/PROGRESS.md`

- [x] Inspect nested `apps/hermes-agent` diff.
- [x] Restore only the generated `setup-hermes.sh` CRLF-normalization change in the nested checkout.
- [x] Re-run `payloads --json` and confirm Hermes Agent git status is clean.
- [x] Record the cleanup in progress docs and commit if tracked docs changed.

### Task 4: Automatic Port Remapping

**Files:**
- Create: `core/node/src/ports-runtime.ts`
- Modify: `core/node/src/lifecycle.ts`
- Modify: `core/node/src/wsl-adapter.ts`
- Modify: `core/node/src/status.ts`
- Modify: `core/node/src/portal-server.ts`
- Modify: `core/node/src/portal.ts`
- Test: `tests/test_windows_core.py`
- Docs: `docs/PRD.md`, `docs/PROGRESS.md`

- [x] Add failing tests where default service ports are occupied and `start --json` assigns free replacement ports.
- [x] Add failing tests proving health URLs and portal URLs use runtime-assigned ports.
- [x] Implement runtime port assignment stored in `data/tmp/ports.json`.
- [x] Expand adapter start commands from resolved service env so `${OPENCLAW_GATEWAY_PORT}` and similar placeholders work in WSL and Windows commands.
- [x] Support portal port reassignment and return the actual portal URL from `start --json`.
- [x] Build, run focused tests, then commit.

### Task 5: Setup Wizard

**Files:**
- Create: `core/node/src/setup-wizard.ts`
- Modify: `core/node/src/core.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/windows/clawhermes.ps1`
- Test: `tests/test_windows_core.py`
- Docs: `README.md`, `docs/PROGRESS.md`

- [x] Add a failing test for `setup-wizard --json` returning ordered phases with commands, confirmation requirements, and no host mutation.
- [x] Implement a read-only setup wizard that combines setup diagnostics, payload inventory, WSL workflow, env init, setup-adapter, start, verify, backup, and release checklist pointers.
- [x] Add PowerShell wrapper support and docs.
- [x] Build, run focused tests, then commit.

### Task 6: Release Checklist

**Files:**
- Create: `docs/release-checklist.md`
- Modify: `README.md`
- Modify: `docs/PROGRESS.md`

- [ ] Add release checklist covering clean git, tests, payload inventory, payload export, WSL backup, C temp cleanup, service start/stop smoke, and artifact locations.
- [ ] Link the checklist from README and progress docs.
- [ ] Run docs/UTF-8 checks and commit.
