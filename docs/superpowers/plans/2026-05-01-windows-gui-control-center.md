# Windows GUI Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Windows GUI control center for ClawHermes-USB with beginner install guidance, hidden service commands, web UI shortcuts, theme preference, logs, backup, and model configuration.

**Architecture:** Add a thin Batch GUI launcher, a PowerShell Windows Forms GUI, and a TypeScript `model-config` core command. The GUI calls `core/windows/clawhermes.ps1` for all orchestration and uses a hidden process helper so normal users do not see multiple command windows. Model configuration is written by core helpers into project-local data and service config files instead of ad hoc GUI string edits.

**Tech Stack:** PowerShell 5 Windows Forms, existing TypeScript/Node dispatcher, Python unittest coverage.

---

## File Map

- Create `launcher/windows/ClawHermes-Control.bat`: double-click entry that resolves the USB root and launches the GUI script.
- Create `launcher/windows/ClawHermes-Control.ps1`: Windows Forms GUI with left navigation, theme support, command execution, beginner install pages, model config form, logs, and web UI buttons.
- Create `core/node/src/model-config.ts`: validation and structured model configuration writes for OpenClaw and Hermes.
- Modify `core/node/src/clawhermes.ts`: add `model-config` and `model-config-status` actions and argument parsing.
- Modify `core/node/src/core.ts`: export model config helpers.
- Modify `core/node/dist/*`: generated build output from `npm run build`.
- Modify `tests/test_windows_core.py`: tests for GUI launcher contract, GUI labels/helper text, model config validation, config writes, and secret masking.
- Modify `README.md` and `README.zh-CN.md`: present the GUI as the primary Windows entry.
- Modify `docs/PROGRESS.md`: record implementation completion and validation.

## Task 1: GUI Launcher Contract

**Files:**
- Create: `launcher/windows/ClawHermes-Control.bat`
- Create: `launcher/windows/ClawHermes-Control.ps1`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write failing launcher tests**

Add tests that assert the new Batch launcher calls `ClawHermes-Control.ps1`, forwards the project root, and that the PowerShell GUI script exposes the agreed left-nav labels, beginner-mode copy, theme options, and hidden process helper.

Expected test shape:

```python
def test_gui_control_launcher_calls_powershell_gui(self):
    text = (ROOT / "launcher" / "windows" / "ClawHermes-Control.bat").read_text(encoding="utf-8")
    self.assertIn('ClawHermes-Control.ps1" -UsbRoot "%USB_ROOT%"', text)
    self.assertIn("set CLAWHERMES_EXIT=%ERRORLEVEL%", text)
    self.assertIn("endlocal & exit /b %CLAWHERMES_EXIT%", text)

def test_gui_control_script_exposes_left_nav_theme_and_hidden_runner(self):
    text = (ROOT / "launcher" / "windows" / "ClawHermes-Control.ps1").read_text(encoding="utf-8")
    for label in ["总览", "安装向导", "启动服务", "停止服务", "打开界面", "模型配置", "日志", "备份", "修复 / 更新"]:
        self.assertIn(label, text)
    for theme in ["跟随系统", "浅色", "深色"]:
        self.assertIn(theme, text)
    self.assertIn("CreateNoWindow = $true", text)
    self.assertIn("UseShellExecute = $false", text)
    self.assertNotIn("setx ", text.lower())
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m unittest tests.test_windows_core.WindowsCoreTests.test_gui_control_launcher_calls_powershell_gui tests.test_windows_core.WindowsCoreTests.test_gui_control_script_exposes_left_nav_theme_and_hidden_runner -v
```

Expected: both fail because files do not exist yet.

- [ ] **Step 3: Add minimal launcher and GUI script skeleton**

Create `ClawHermes-Control.bat` as a thin bridge and `ClawHermes-Control.ps1` with parameters, root resolution, nav labels, theme labels, and hidden process helper.

- [ ] **Step 4: Run tests to verify they pass**

Run the same focused test command. Expected: PASS.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: add Windows GUI control launcher (feat: 添加Windows图形控制入口)
```

## Task 2: Model Config Core Command

**Files:**
- Create: `core/node/src/model-config.ts`
- Modify: `core/node/src/clawhermes.ts`
- Modify: `core/node/src/core.ts`
- Generated: `core/node/dist/`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write failing model config tests**

Add tests for required fields, masked status, OpenClaw config writes, Hermes config writes, and no secret leakage in stdout.

Expected test shape:

```python
def test_model_config_rejects_missing_required_fields(self):
    temp_dir, temp_root = make_temp_skeleton_usb_root()
    try:
        result = run_dispatcher_for_root(temp_root, "model-config", "--provider-type", "openai-compatible", "--api-url", "https://api.example.com/v1", "--api-key", "secret", "-Json")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("model name is required", result.stderr.lower())
    finally:
        temp_dir.cleanup()

def test_model_config_applies_openclaw_and_hermes_without_printing_secret(self):
    temp_dir, temp_root = make_temp_skeleton_usb_root()
    try:
        result = run_dispatcher_for_root(
            temp_root,
            "model-config",
            "--provider-type", "openai-compatible",
            "--api-url", "https://api.example.com/v1",
            "--model", "demo-model",
            "--api-key", "super-secret-key",
            "--apply", "both",
            "-Json",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("super-secret-key", result.stdout)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["display"]["apiKey"], "已保存")
        openclaw = json.loads((temp_root / "data" / "openclaw" / "openclaw.json").read_text(encoding="utf-8"))
        provider = openclaw["models"]["providers"]["clawhermes"]
        self.assertEqual(provider["baseUrl"], "https://api.example.com/v1")
        self.assertEqual(provider["apiKey"], "super-secret-key")
        self.assertIn("clawhermes/demo-model", openclaw["agents"]["defaults"]["models"])
        hermes_config = (temp_root / "data" / "hermes" / "config.yaml").read_text(encoding="utf-8")
        self.assertIn("model: demo-model", hermes_config)
        self.assertIn("base_url: https://api.example.com/v1", hermes_config)
        hermes_env = (temp_root / "data" / "hermes" / ".env").read_text(encoding="utf-8")
        self.assertIn("OPENAI_API_KEY=super-secret-key", hermes_env)
    finally:
        temp_dir.cleanup()
```

- [ ] **Step 2: Run tests to verify they fail**

Run the two focused tests. Expected: fail with unknown action or missing command.

- [ ] **Step 3: Implement `model-config.ts`**

Implement:

- validation for provider type, API URL, model name, API key, and apply target
- project-local secret storage in `data/settings/model-config.json`
- OpenClaw config merge under `data/openclaw/openclaw.json`
- Hermes config write under `data/hermes/config.yaml` plus `data/hermes/.env`
- redacted JSON response

- [ ] **Step 4: Wire CLI actions**

Add `model-config` and `model-config-status` to `clawhermes.ts` and export helpers from `core.ts`.

- [ ] **Step 5: Build and pass tests**

Run:

```powershell
npm run build
python -m unittest tests.test_windows_core.WindowsCoreTests.test_model_config_rejects_missing_required_fields tests.test_windows_core.WindowsCoreTests.test_model_config_applies_openclaw_and_hermes_without_printing_secret -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

Commit message:

```text
feat: add shared model configuration command (feat: 添加共享模型配置命令)
```

## Task 3: GUI Pages And Command Wiring

**Files:**
- Modify: `launcher/windows/ClawHermes-Control.ps1`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write failing GUI content tests**

Add tests that the GUI script calls the expected dispatcher actions and includes all required user-facing page actions.

Expected assertions include:

```python
self.assertIn("setup-wizard", text)
self.assertIn("payloads", text)
self.assertIn("wsl-import-plan", text)
self.assertIn("wsl-import", text)
self.assertIn("model-config", text)
self.assertIn("start", text)
self.assertIn("stop", text)
self.assertIn("status", text)
self.assertIn("backup", text)
self.assertIn("logs", text)
self.assertIn("打开 OpenClaw Chat", text)
self.assertIn("打开 Hermes Web UI", text)
self.assertIn("API URL / Base URL", text)
self.assertIn("API Key", text)
```

- [ ] **Step 2: Run test to verify it fails**

Expected: fail until GUI pages are implemented.

- [ ] **Step 3: Implement GUI pages**

Implement Windows Forms pages:

- overview/status cards
- install wizard checks and actions
- start/stop pages
- open interfaces page
- model config form calling `model-config`
- log viewer calling `logs`
- backup page
- repair/update diagnostics page

- [ ] **Step 4: Run GUI-focused tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message:

```text
feat: build Windows GUI control pages (feat: 构建Windows图形控制页面)
```

## Task 4: Theme Preference And Documentation

**Files:**
- Modify: `launcher/windows/ClawHermes-Control.ps1`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/PROGRESS.md`
- Test: `tests/test_windows_core.py`

- [ ] **Step 1: Write failing tests**

Add tests that theme preference is project-local and README documents the GUI primary path.

Expected assertions:

```python
self.assertIn("data\\settings\\gui.json", text)
self.assertIn("跟随系统", text)
self.assertIn("ClawHermes-Control.bat", readme_text)
self.assertIn("图形控制中心", readme_zh_text)
```

- [ ] **Step 2: Implement theme preference**

Read/write `data/settings/gui.json` with values `system`, `light`, or `dark`. Do not write Windows global settings.

- [ ] **Step 3: Update docs**

Describe the GUI as the recommended Windows path and keep existing numbered scripts as fallback/maintenance.

- [ ] **Step 4: Run focused docs and GUI tests**

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message:

```text
docs: document Windows GUI control center (docs: 记录Windows图形控制中心)
```

## Task 5: Final Verification

**Files:**
- No planned code edits unless verification finds a bug.

- [ ] **Step 1: Run focused launcher/model tests**

Run all GUI and model config tests added in this plan. Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```powershell
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Run whitespace check**

Run:

```powershell
git diff --check
```

Expected: no errors.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: clean after commits.

## Self-Review

Spec coverage:

- Left navigation: Task 1 and Task 3.
- Beginner install wizard: Task 3.
- Hidden child windows: Task 1 and Task 3.
- Web UI shortcuts: Task 3.
- Model configuration with URL/model/API key/apply targets: Task 2 and Task 3.
- Light/dark/system theme: Task 4.
- Documentation and progress: Task 4.
- Verification: Task 5.

No unresolved scope items remain in this plan. The first version intentionally excludes tray-only packaging and destructive WSL unregister in beginner mode.
