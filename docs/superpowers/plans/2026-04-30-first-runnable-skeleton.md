# First Runnable Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Windows runnable skeleton for ClawHermes-USB without integrating upstream OpenClaw or Hermes payloads.

**Architecture:** Thin batch launchers call a PowerShell dispatcher in `core/windows`. A reusable PowerShell module owns paths, environment setup, adapter validation, logging, placeholder metadata, and portal generation.

**Tech Stack:** Windows PowerShell 5.1, batch launchers, Python `unittest` verification.

---

### Task 1: Core Module Tests

**Files:**
- Create: `tests/test_windows_core.py`
- Create: `core/windows/ClawHermes.Core.psm1`
- Create: `core/windows/clawhermes.ps1`

- [x] **Step 1: Write failing tests for core behavior**

Create Python tests that call PowerShell and assert:

- `Get-ClawHermesRoot` returns the repository root.
- `New-ClawHermesPortableEnvironment` maps home/cache/temp variables under `data/`.
- `Test-ClawHermesSetup` reports missing runtime executables while still validating adapters.

Run: `python -m unittest tests.test_windows_core -v`

Expected: FAIL because `core/windows/clawhermes.ps1` does not exist.

- [x] **Step 2: Implement minimal PowerShell core**

Create `ClawHermes.Core.psm1` with:

- `Get-ClawHermesRoot`
- `New-ClawHermesPortableEnvironment`
- `Get-ClawHermesAdapter`
- `Test-ClawHermesAdapter`
- `Test-ClawHermesSetup`
- `Write-ClawHermesLog`

Create `clawhermes.ps1` with `setup` and `env-json` actions.

- [x] **Step 3: Verify core tests pass**

Run: `python -m unittest tests.test_windows_core -v`

Expected: PASS.

### Task 2: Start Status Stop Flow

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/windows/ClawHermes.Core.psm1`
- Modify: `core/windows/clawhermes.ps1`
- Modify: `launcher/windows/Start.bat`
- Modify: `launcher/windows/Setup.bat`
- Modify: `launcher/windows/Status.bat`
- Modify: `launcher/windows/Stop.bat`

- [x] **Step 1: Write failing tests for lifecycle**

Add tests that run:

- `clawhermes.ps1 start`
- `clawhermes.ps1 status`
- `clawhermes.ps1 stop`

Assert logs are created under `data/logs`, PID metadata appears under `data/tmp/pids`, status lists adapters, and stop removes PID metadata.

Run: `python -m unittest tests.test_windows_core -v`

Expected: FAIL because lifecycle actions are missing.

- [x] **Step 2: Implement placeholder lifecycle**

Add:

- `Start-ClawHermesSkeleton`
- `Get-ClawHermesStatus`
- `Stop-ClawHermesSkeleton`

Update batch files to invoke the dispatcher with `-ExecutionPolicy Bypass`.

- [x] **Step 3: Verify lifecycle tests pass**

Run: `python -m unittest tests.test_windows_core -v`

Expected: PASS.

### Task 3: Portal Generation and Documentation

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/windows/ClawHermes.Core.psm1`
- Modify: `portal/README.md`
- Modify: `docs/PROGRESS.md`

- [x] **Step 1: Write failing tests for portal output**

Assert `start` generates `portal/index.html` with project root, data root, service labels, and log paths.

Run: `python -m unittest tests.test_windows_core -v`

Expected: FAIL because portal generation is incomplete.

- [x] **Step 2: Implement portal generation**

Add `New-ClawHermesPortal` and call it from `start`.

- [x] **Step 3: Update documentation**

Update `portal/README.md` and add a concise progress entry to `docs/PROGRESS.md`.

- [x] **Step 4: Final verification**

Run:

```powershell
python -m unittest tests.test_windows_core -v
powershell -NoProfile -ExecutionPolicy Bypass -File core/windows/clawhermes.ps1 setup -UsbRoot .
powershell -NoProfile -ExecutionPolicy Bypass -File core/windows/clawhermes.ps1 start -UsbRoot .
powershell -NoProfile -ExecutionPolicy Bypass -File core/windows/clawhermes.ps1 status -UsbRoot .
powershell -NoProfile -ExecutionPolicy Bypass -File core/windows/clawhermes.ps1 stop -UsbRoot .
```

Expected: tests pass; commands exit 0; setup reports missing portable runtime executables as diagnostics; start/status/stop operate on placeholder metadata.
