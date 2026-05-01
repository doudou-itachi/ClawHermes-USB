# Windows User Launchers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add double-click Windows launchers that guide non-technical USB users through offline-first install, start, stop, status, backup, uninstall, and repair flows.

**Architecture:** Keep `.bat` files as tiny project-root resolvers that call one shared PowerShell guide script. The PowerShell guide owns user prompts, summaries, pause-on-exit behavior, and safe sequencing; all real project operations continue through `core/windows/clawhermes.ps1` and the TypeScript core.

**Tech Stack:** Windows Batch, Windows PowerShell 5+, existing Node/TypeScript CLI, Python `unittest` launcher coverage.

---

## File Structure

- Create `launcher/windows/UserGuide.ps1`: shared interactive guide with `-Mode Install|Start|Stop|Status|Backup|Uninstall|Repair`, `-NoPause`, `-AssumeYes`, and `-PlanOnly` switches.
- Create `launcher/windows/1-Install-ClawHermes.bat`: double-click install entry.
- Create `launcher/windows/2-Start-ClawHermes.bat`: double-click start entry.
- Create `launcher/windows/3-Stop-ClawHermes.bat`: double-click stop entry.
- Create `launcher/windows/4-Status-ClawHermes.bat`: double-click status entry.
- Create `launcher/windows/5-Backup-ClawHermes.bat`: double-click backup entry.
- Create `launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat`: guarded host WSL cleanup entry.
- Create `launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat`: advanced diagnostics and network-maintenance entry.
- Modify `tests/test_windows_core.py`: add launcher file and PowerShell guide behavior tests that do not run real WSL host changes.
- Modify `README.md`: document user launchers and offline-first packaging.
- Modify `README.zh-CN.md`: add readable UTF-8 Chinese user launcher section.
- Modify `docs/PROGRESS.md`: add a milestone entry after implementation and verification.

## Task 1: Batch Entry Points

**Files:**
- Create: `launcher/windows/1-Install-ClawHermes.bat`
- Create: `launcher/windows/2-Start-ClawHermes.bat`
- Create: `launcher/windows/3-Stop-ClawHermes.bat`
- Create: `launcher/windows/4-Status-ClawHermes.bat`
- Create: `launcher/windows/5-Backup-ClawHermes.bat`
- Create: `launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat`
- Create: `launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat`
- Modify: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing batch launcher test**

Add this test near `test_windows_batch_launchers_forward_exit_codes_and_start_opens_portal`:

```python
    def test_user_facing_batch_launchers_call_shared_user_guide(self):
        launchers = {
            "1-Install-ClawHermes.bat": "Install",
            "2-Start-ClawHermes.bat": "Start",
            "3-Stop-ClawHermes.bat": "Stop",
            "4-Status-ClawHermes.bat": "Status",
            "5-Backup-ClawHermes.bat": "Backup",
            "6-Uninstall-Host-WSL-ClawHermes.bat": "Uninstall",
            "Tools-Repair-Or-Update-ClawHermes.bat": "Repair",
        }

        for file_name, mode in launchers.items():
            text = (ROOT / "launcher" / "windows" / file_name).read_text(encoding="utf-8")
            self.assertIn("set SCRIPT_DIR=%~dp0", text)
            self.assertIn("set USB_ROOT=%%~fI", text)
            self.assertIn("UserGuide.ps1", text)
            self.assertIn(f"-Mode {mode}", text)
            self.assertIn("-UsbRoot \"%USB_ROOT%\"", text)
            self.assertIn("set CLAWHERMES_EXIT=%ERRORLEVEL%", text)
            self.assertIn("endlocal & exit /b %CLAWHERMES_EXIT%", text)
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_facing_batch_launchers_call_shared_user_guide -v
```

Expected: FAIL because the new batch files do not exist.

- [ ] **Step 3: Add the batch files**

Create each file with the exact content below.

`launcher/windows/1-Install-ClawHermes.bat`:

```bat
@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Install -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
```

`launcher/windows/2-Start-ClawHermes.bat`:

```bat
@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Start -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
```

`launcher/windows/3-Stop-ClawHermes.bat`:

```bat
@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Stop -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
```

`launcher/windows/4-Status-ClawHermes.bat`:

```bat
@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Status -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
```

`launcher/windows/5-Backup-ClawHermes.bat`:

```bat
@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Backup -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
```

`launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat`:

```bat
@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Uninstall -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
```

`launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat`:

```bat
@echo off
setlocal
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..\..") do set USB_ROOT=%%~fI
powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\launcher\windows\UserGuide.ps1" -Mode Repair -UsbRoot "%USB_ROOT%"
set CLAWHERMES_EXIT=%ERRORLEVEL%
endlocal & exit /b %CLAWHERMES_EXIT%
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_facing_batch_launchers_call_shared_user_guide -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add launcher/windows/1-Install-ClawHermes.bat launcher/windows/2-Start-ClawHermes.bat launcher/windows/3-Stop-ClawHermes.bat launcher/windows/4-Status-ClawHermes.bat launcher/windows/5-Backup-ClawHermes.bat launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat tests/test_windows_core.py
git commit -m "feat: add Windows user launcher entries (feat: 添加Windows用户启动入口)"
```

## Task 2: Shared PowerShell Guide Skeleton

**Files:**
- Create: `launcher/windows/UserGuide.ps1`
- Modify: `tests/test_windows_core.py`

- [ ] **Step 1: Write the failing guide skeleton test**

Add this test near the launcher tests:

```python
    def test_user_guide_script_exposes_safe_modes_and_noninteractive_switches(self):
        text = (ROOT / "launcher" / "windows" / "UserGuide.ps1").read_text(encoding="utf-8")

        self.assertIn('[ValidateSet("Install", "Start", "Stop", "Status", "Backup", "Uninstall", "Repair")]', text)
        self.assertIn("[switch]$NoPause", text)
        self.assertIn("[switch]$AssumeYes", text)
        self.assertIn("[switch]$PlanOnly", text)
        self.assertIn("core\\windows\\clawhermes.ps1", text)
        self.assertIn("data\\logs", text)
        self.assertNotIn("setx ", text.lower())
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_guide_script_exposes_safe_modes_and_noninteractive_switches -v
```

Expected: FAIL because `UserGuide.ps1` does not exist.

- [ ] **Step 3: Create the shared guide script**

Create `launcher/windows/UserGuide.ps1` with this content:

```powershell
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Install", "Start", "Stop", "Status", "Backup", "Uninstall", "Repair")]
    [string]$Mode,

    [string]$UsbRoot,

    [switch]$NoPause,

    [switch]$AssumeYes,

    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

function Resolve-ClawHermesRoot {
    param([string]$Root)
    if (-not [string]::IsNullOrWhiteSpace($Root)) {
        return (Resolve-Path -LiteralPath $Root).Path
    }
    $scriptRoot = $PSScriptRoot
    return (Resolve-Path -LiteralPath (Join-Path -Path $scriptRoot -ChildPath "..\..")).Path
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "== $Title =="
}

function Invoke-ClawHermes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [string[]]$Arguments = @()
    )
    $dispatcher = Join-Path -Path $Root -ChildPath "core\windows\clawhermes.ps1"
    if (-not (Test-Path -LiteralPath $dispatcher -PathType Leaf)) {
        throw "Cannot find core dispatcher: $dispatcher"
    }
    & powershell -NoProfile -ExecutionPolicy Bypass -File $dispatcher $Action -UsbRoot $Root @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Action $($Arguments -join ' ')"
    }
}

function Invoke-ClawHermesJson {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root,
        [Parameter(Mandatory = $true)]
        [string]$Action,
        [string[]]$Arguments = @()
    )
    $dispatcher = Join-Path -Path $Root -ChildPath "core\windows\clawhermes.ps1"
    if (-not (Test-Path -LiteralPath $dispatcher -PathType Leaf)) {
        throw "Cannot find core dispatcher: $dispatcher"
    }
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $dispatcher $Action -UsbRoot $Root -Json @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Action $($Arguments -join ' ')"
    }
    return ($output | Out-String | ConvertFrom-Json)
}

function Confirm-GuideAction {
    param(
        [string]$Prompt,
        [string]$RequiredText = "YES"
    )
    if ($AssumeYes) {
        return $true
    }
    $answer = Read-Host "$Prompt Type $RequiredText to continue"
    return $answer -eq $RequiredText
}

function Get-PortalUrl {
    param([string]$Root)
    $portsPath = Join-Path -Path $Root -ChildPath "data\tmp\ports.json"
    if (Test-Path -LiteralPath $portsPath -PathType Leaf) {
        try {
            $ports = Get-Content -LiteralPath $portsPath -Raw | ConvertFrom-Json
            if ($ports.portal.url) {
                return [string]$ports.portal.url
            }
        } catch {
            return "http://127.0.0.1:17000/"
        }
    }
    return "http://127.0.0.1:17000/"
}

function Show-LogHint {
    param([string]$Root)
    $logRoot = Join-Path -Path $Root -ChildPath "data\logs"
    Write-Host "Logs: $logRoot"
}

function Complete-Guide {
    param([string]$Root)
    if (-not $NoPause) {
        Write-Host ""
        Show-LogHint -Root $Root
        Read-Host "Press Enter to close"
    }
}

$root = Resolve-ClawHermesRoot -Root $UsbRoot
$exitCode = 0

try {
    Write-Host "ClawHermes-USB"
    Write-Host "USB root: $root"

    switch ($Mode) {
        "Install" {
            Write-Section "Offline-first install"
            Write-Host "This guide checks the prepared USB payloads before making host changes."
            Invoke-ClawHermes -Root $root -Action "setup-wizard" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "payloads" -Arguments @()
            if ($PlanOnly) {
                Write-Host "Plan-only mode finished. No install actions were run."
                break
            }
            Invoke-ClawHermes -Root $root -Action "init-env" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "wsl-import-plan" -Arguments @("--distro", "Ubuntu")
            if (Confirm-GuideAction -Prompt "Import the managed ClawHermes-Ubuntu WSL distro?" -RequiredText "IMPORT") {
                Invoke-ClawHermes -Root $root -Action "wsl-import" -Arguments @("--distro", "Ubuntu", "--confirm-import")
            } else {
                Write-Host "Skipped WSL import."
            }
            Invoke-ClawHermes -Root $root -Action "start" -Arguments @()
            $portalUrl = Get-PortalUrl -Root $root
            Write-Host "Portal: $portalUrl"
            Start-Process $portalUrl
        }
        "Start" {
            Write-Section "Start"
            Invoke-ClawHermes -Root $root -Action "start" -Arguments @()
            $portalUrl = Get-PortalUrl -Root $root
            Write-Host "Portal: $portalUrl"
            Start-Process $portalUrl
        }
        "Stop" {
            Write-Section "Stop"
            Invoke-ClawHermes -Root $root -Action "stop" -Arguments @()
        }
        "Status" {
            Write-Section "Status"
            $status = Invoke-ClawHermesJson -Root $root -Action "status" -Arguments @()
            foreach ($service in $status.services) {
                Write-Host ("{0}: {1}" -f $service.id, $service.status)
            }
            Write-Host "Portal: $(Get-PortalUrl -Root $root)"
        }
        "Backup" {
            Write-Section "Backup"
            Invoke-ClawHermes -Root $root -Action "backup" -Arguments @()
        }
        "Uninstall" {
            Write-Section "Uninstall host WSL environment"
            Write-Host "This only targets the managed ClawHermes-Ubuntu WSL distribution on this Windows host."
            Write-Host "It does not delete the USB project directory."
            Invoke-ClawHermes -Root $root -Action "stop" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "wsl-unregister-plan" -Arguments @("--distro", "Ubuntu")
            if ($PlanOnly) {
                Write-Host "Plan-only mode finished. The WSL distribution was not unregistered."
                break
            }
            if (Confirm-GuideAction -Prompt "Unregister ClawHermes-Ubuntu from this Windows host?" -RequiredText "UNREGISTER") {
                Invoke-ClawHermes -Root $root -Action "wsl-unregister" -Arguments @("--distro", "Ubuntu", "--confirm-unregister")
            } else {
                Write-Host "Skipped WSL unregister."
            }
        }
        "Repair" {
            Write-Section "Repair or update"
            Write-Host "Normal offline use should not require network actions."
            Invoke-ClawHermes -Root $root -Action "setup" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "payloads" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "runtimes" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "sources" -Arguments @()
        }
    }
} catch {
    $exitCode = 1
    Write-Host ""
    Write-Host "ClawHermes-USB could not finish this action."
    Write-Host $_.Exception.Message
    Show-LogHint -Root $root
} finally {
    Complete-Guide -Root $root
}

exit $exitCode
```

- [ ] **Step 4: Run the skeleton test to verify it passes**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_guide_script_exposes_safe_modes_and_noninteractive_switches -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add launcher/windows/UserGuide.ps1 tests/test_windows_core.py
git commit -m "feat: add Windows user guide script (feat: 添加Windows用户引导脚本)"
```

## Task 3: Noninteractive Guide Behavior

**Files:**
- Modify: `launcher/windows/UserGuide.ps1`
- Modify: `tests/test_windows_core.py`

- [ ] **Step 1: Write failing behavior tests**

Add these helpers near the existing PowerShell dispatcher helpers:

```python
def run_user_guide(mode, *args, root=ROOT, env=None):
    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(root / "launcher" / "windows" / "UserGuide.ps1"),
        "-Mode",
        mode,
        "-UsbRoot",
        str(root),
        "-NoPause",
        *args,
    ]
    return subprocess.run(command, cwd=root, text=True, capture_output=True, env={**os.environ, **(env or {})})
```

Add these tests near the user launcher tests:

```python
    def test_user_guide_status_runs_without_pausing_and_prints_services(self):
        result = run_user_guide("Status")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ClawHermes-USB", result.stdout)
        self.assertIn("USB root:", result.stdout)
        self.assertIn("openclaw:", result.stdout)
        self.assertIn("Portal:", result.stdout)

    def test_user_guide_install_plan_only_does_not_import_wsl_or_start_services(self):
        result = run_user_guide("Install", "-PlanOnly")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Offline-first install", result.stdout)
        self.assertIn("Plan-only mode finished", result.stdout)
        self.assertNotIn("Portal:", result.stdout)

    def test_user_guide_uninstall_plan_only_shows_guard_without_unregistering(self):
        result = run_user_guide("Uninstall", "-PlanOnly")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Uninstall host WSL environment", result.stdout)
        self.assertIn("ClawHermes-Ubuntu", result.stdout)
        self.assertIn("was not unregistered", result.stdout)
```

- [ ] **Step 2: Run behavior tests to see current failures**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_guide_status_runs_without_pausing_and_prints_services tests.test_windows_core.WindowsCoreTests.test_user_guide_install_plan_only_does_not_import_wsl_or_start_services tests.test_windows_core.WindowsCoreTests.test_user_guide_uninstall_plan_only_shows_guard_without_unregistering -v
```

Expected: at least one FAIL if the initial script output or plan-only branching is not aligned with the tests.

- [ ] **Step 3: Adjust `UserGuide.ps1` for stable noninteractive output**

If the tests fail because of error handling around missing WSL on a development host, update the `Install` and `Uninstall` plan-only branches so they use only read-only commands that are already expected to work without modifying host state.

Use these exact `Install` and `Uninstall` switch arms:

```powershell
        "Install" {
            Write-Section "Offline-first install"
            Write-Host "This guide checks the prepared USB payloads before making host changes."
            Invoke-ClawHermes -Root $root -Action "setup-wizard" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "payloads" -Arguments @()
            if ($PlanOnly) {
                Write-Host "Plan-only mode finished. No install actions were run."
                break
            }
            Invoke-ClawHermes -Root $root -Action "init-env" -Arguments @()
            Invoke-ClawHermes -Root $root -Action "wsl-import-plan" -Arguments @("--distro", "Ubuntu")
            if (Confirm-GuideAction -Prompt "Import the managed ClawHermes-Ubuntu WSL distro?" -RequiredText "IMPORT") {
                Invoke-ClawHermes -Root $root -Action "wsl-import" -Arguments @("--distro", "Ubuntu", "--confirm-import")
            } else {
                Write-Host "Skipped WSL import."
            }
            Invoke-ClawHermes -Root $root -Action "start" -Arguments @()
            $portalUrl = Get-PortalUrl -Root $root
            Write-Host "Portal: $portalUrl"
            Start-Process $portalUrl
        }
        "Uninstall" {
            Write-Section "Uninstall host WSL environment"
            Write-Host "This only targets the managed ClawHermes-Ubuntu WSL distribution on this Windows host."
            Write-Host "It does not delete the USB project directory."
            Invoke-ClawHermes -Root $root -Action "wsl-unregister-plan" -Arguments @("--distro", "Ubuntu")
            if ($PlanOnly) {
                Write-Host "Plan-only mode finished. The WSL distribution was not unregistered."
                break
            }
            Invoke-ClawHermes -Root $root -Action "stop" -Arguments @()
            if (Confirm-GuideAction -Prompt "Unregister ClawHermes-Ubuntu from this Windows host?" -RequiredText "UNREGISTER") {
                Invoke-ClawHermes -Root $root -Action "wsl-unregister" -Arguments @("--distro", "Ubuntu", "--confirm-unregister")
            } else {
                Write-Host "Skipped WSL unregister."
            }
        }
```

- [ ] **Step 4: Run behavior tests to verify they pass**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_guide_status_runs_without_pausing_and_prints_services tests.test_windows_core.WindowsCoreTests.test_user_guide_install_plan_only_does_not_import_wsl_or_start_services tests.test_windows_core.WindowsCoreTests.test_user_guide_uninstall_plan_only_shows_guard_without_unregistering -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add launcher/windows/UserGuide.ps1 tests/test_windows_core.py
git commit -m "test: cover Windows user guide plan mode (test: 覆盖Windows用户引导计划模式)"
```

## Task 4: Start and Backup Guide Verification

**Files:**
- Modify: `launcher/windows/UserGuide.ps1`
- Modify: `tests/test_windows_core.py`

- [ ] **Step 1: Write failing tests for start URL and backup behavior**

Add these tests near the user guide tests:

```python
    def test_user_guide_start_opens_runtime_portal_url_text(self):
        result = run_user_guide("Start")
        try:
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Start", result.stdout)
            self.assertIn("Portal: http://127.0.0.1:", result.stdout)
        finally:
            run_dispatcher("stop", "-Json")

    def test_user_guide_backup_creates_data_backup_without_uninstall_words(self):
        result = run_user_guide("Backup")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Backup", result.stdout)
        self.assertNotIn("unregister", result.stdout.lower())
        self.assertNotIn("ClawHermes-Ubuntu", result.stdout)
```

- [ ] **Step 2: Run tests to verify current behavior**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_guide_start_opens_runtime_portal_url_text tests.test_windows_core.WindowsCoreTests.test_user_guide_backup_creates_data_backup_without_uninstall_words -v
```

Expected: PASS if Task 2 implementation already matches the design. If the start test opens a browser during automated tests, continue to Step 3.

- [ ] **Step 3: Make browser opening suppressible in tests**

Modify `UserGuide.ps1` by adding this helper before `Complete-Guide`:

```powershell
function Open-GuideUrl {
    param([string]$Url)
    if ($NoPause) {
        return
    }
    Start-Process $Url
}
```

Replace each `Start-Process $portalUrl` with:

```powershell
            Open-GuideUrl -Url $portalUrl
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_guide_start_opens_runtime_portal_url_text tests.test_windows_core.WindowsCoreTests.test_user_guide_backup_creates_data_backup_without_uninstall_words -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add launcher/windows/UserGuide.ps1 tests/test_windows_core.py
git commit -m "fix: make Windows guide test-safe (fix: 让Windows引导脚本便于测试)"
```

## Task 5: Documentation and Progress

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/PROGRESS.md`

- [ ] **Step 1: Add English README launcher section**

In `README.md`, after the current "Run the Windows launchers" block, add:

```markdown
For non-technical USB users, use the numbered double-click launchers:

```text
launcher/windows/1-Install-ClawHermes.bat
launcher/windows/2-Start-ClawHermes.bat
launcher/windows/3-Stop-ClawHermes.bat
launcher/windows/4-Status-ClawHermes.bat
launcher/windows/5-Backup-ClawHermes.bat
launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat
launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat
```

The normal release path is offline-first: prepare portable runtimes, app payloads, and WSL artifacts before handing the USB drive to a user. The repair/update launcher is for advanced maintenance and may require network access.
```

- [ ] **Step 2: Add Chinese README launcher section**

In `README.zh-CN.md`, after the Windows launcher block, add readable UTF-8 Chinese text:

```markdown
面向普通 U 盘用户时，优先使用这些按顺序编号的双击脚本：

```text
launcher/windows/1-Install-ClawHermes.bat
launcher/windows/2-Start-ClawHermes.bat
launcher/windows/3-Stop-ClawHermes.bat
launcher/windows/4-Status-ClawHermes.bat
launcher/windows/5-Backup-ClawHermes.bat
launcher/windows/6-Uninstall-Host-WSL-ClawHermes.bat
launcher/windows/Tools-Repair-Or-Update-ClawHermes.bat
```

推荐交付方式是离线优先：在交给用户之前，把便携运行时、上游应用 payload、WSL rootfs 或 WSL 备份包准备好。修复/更新入口用于高级维护，可能需要联网。
```

- [ ] **Step 3: Add progress entry**

Add this entry near the top of `docs/PROGRESS.md` under `## 2026-05-01`:

```markdown
### Windows User Launchers

Status: `Done`

Summary:

- Added numbered double-click Windows launchers for install, start, stop, status, backup, host WSL uninstall, and advanced repair/update.
- Added a shared PowerShell user guide that keeps Batch files thin and forwards real operations to the existing core dispatcher.
- Kept normal user flow offline-first while labeling network repair/update as advanced maintenance.
- Preserved explicit guardrails for WSL import and WSL unregister operations.

Changed areas:

- `launcher/windows/`
- `tests/test_windows_core.py`
- `README.md`
- `README.zh-CN.md`
- `docs/PROGRESS.md`

Validation performed:

- `python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_facing_batch_launchers_call_shared_user_guide tests.test_windows_core.WindowsCoreTests.test_user_guide_script_exposes_safe_modes_and_noninteractive_switches tests.test_windows_core.WindowsCoreTests.test_user_guide_status_runs_without_pausing_and_prints_services tests.test_windows_core.WindowsCoreTests.test_user_guide_install_plan_only_does_not_import_wsl_or_start_services tests.test_windows_core.WindowsCoreTests.test_user_guide_uninstall_plan_only_shows_guard_without_unregistering tests.test_windows_core.WindowsCoreTests.test_user_guide_start_opens_runtime_portal_url_text tests.test_windows_core.WindowsCoreTests.test_user_guide_backup_creates_data_backup_without_uninstall_words -v`
- `npm test`
- `git diff --check`

Next steps:

- Run full manual release verification on a clean Windows VM with prepared offline payloads before handing a USB package to end users.
```

- [ ] **Step 4: Run doc and focused test checks**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_chinese_docs_are_readable_utf8 -v
git diff --check
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add README.md README.zh-CN.md docs/PROGRESS.md
git commit -m "docs: document Windows user launchers (docs: 记录Windows用户启动脚本)"
```

## Task 6: Full Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run focused launcher tests**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_user_facing_batch_launchers_call_shared_user_guide tests.test_windows_core.WindowsCoreTests.test_user_guide_script_exposes_safe_modes_and_noninteractive_switches tests.test_windows_core.WindowsCoreTests.test_user_guide_status_runs_without_pausing_and_prints_services tests.test_windows_core.WindowsCoreTests.test_user_guide_install_plan_only_does_not_import_wsl_or_start_services tests.test_windows_core.WindowsCoreTests.test_user_guide_uninstall_plan_only_shows_guard_without_unregistering tests.test_windows_core.WindowsCoreTests.test_user_guide_start_opens_runtime_portal_url_text tests.test_windows_core.WindowsCoreTests.test_user_guide_backup_creates_data_backup_without_uninstall_words -v
```

Expected: PASS.

- [ ] **Step 2: Run full project tests**

Run:

```powershell
npm test
```

Expected: build passes and all Python tests pass.

- [ ] **Step 3: Check diff hygiene**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors. `git status --short` should only show intentional files if commits were deferred by the executor.

- [ ] **Step 4: Confirm no remaining launcher work is unstaged**

Run:

```powershell
git status --short
```

Expected: no remaining files from this plan are unstaged. Pre-existing unrelated files may still appear; leave them alone.

---

## Self-Review

Spec coverage:

- Offline-first install is covered by `Install` guide plan mode, payload inventory, env initialization, WSL import plan, and explicit `IMPORT` confirmation.
- User-facing batch entries are covered by Task 1.
- Thin Batch plus shared PowerShell guide architecture is covered by Tasks 1 and 2.
- Start, stop, status, and backup user flows are covered by Tasks 2 through 4.
- Host WSL uninstall guardrails are covered by Task 3 and existing core `wsl-unregister` backup gates.
- Advanced repair/update entry is covered by Task 2 and README documentation.
- Error handling and log hints are covered in `UserGuide.ps1` skeleton.
- Tests avoid real WSL host mutation by using plan mode and existing core guarded behavior.

Placeholder scan:

- The plan contains concrete file paths, code snippets, commands, and expected outcomes.
- Conditional verification steps name the exact command to run and the expected decision.

Type consistency:

- PowerShell parameters are consistently `-Mode`, `-UsbRoot`, `-NoPause`, `-AssumeYes`, and `-PlanOnly`.
- Batch files consistently call `UserGuide.ps1`.
- Test helper `run_user_guide` matches the PowerShell parameter names.
