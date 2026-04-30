# Portal Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the generated portal at `http://127.0.0.1:17000/` during the Windows skeleton lifecycle.

**Architecture:** Keep portal serving in the Windows core layer as an internal service. `Start-ClawHermesSkeleton` generates `portal/index.html`, starts a small PowerShell `HttpListener` process bound to localhost, records metadata under `data/tmp/pids/portal.pid`, and `Stop-ClawHermesSkeleton` stops that process before placeholder services.

**Tech Stack:** Windows PowerShell 5.1, `System.Net.HttpListener`, Python `unittest` HTTP verification.

---

### Task 1: Portal HTTP Lifecycle

**Files:**
- Modify: `tests/test_windows_core.py`
- Modify: `core/windows/ClawHermes.Core.psm1`
- Create: `core/windows/portal-server.ps1`

- [x] **Step 1: Write failing portal HTTP test**

Add a test that runs `start`, waits for `http://127.0.0.1:17000/`, asserts the HTML contains `ClawHermes-USB Portal`, runs `status`, asserts portal is running, then runs `stop` and asserts the endpoint is no longer reachable.

Run: `python -m unittest tests.test_windows_core -v`

Expected: FAIL because no HTTP server is running.

- [x] **Step 2: Implement portal server script**

Create `core/windows/portal-server.ps1` using `HttpListener` to serve `portal/index.html` on `http://127.0.0.1:17000/`.

- [x] **Step 3: Start and stop portal as an internal service**

Add `Start-ClawHermesPortalServer`, `Stop-ClawHermesPortalServer`, and portal status reporting to the core module.

- [x] **Step 4: Verify tests and command flow**

Run:

```powershell
python -m unittest tests.test_windows_core -v
powershell -NoProfile -ExecutionPolicy Bypass -File core/windows/clawhermes.ps1 start -UsbRoot .
powershell -NoProfile -ExecutionPolicy Bypass -File core/windows/clawhermes.ps1 status -UsbRoot .
powershell -NoProfile -ExecutionPolicy Bypass -File core/windows/clawhermes.ps1 stop -UsbRoot .
```

Expected: tests pass; portal responds while started; status includes portal; stop removes `portal.pid` and stops the listener.
