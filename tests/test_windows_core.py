import json
import os
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import zipfile
import hashlib
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DISPATCHER = ROOT / "core" / "windows" / "clawhermes.ps1"
NODE_CLI = ROOT / "core" / "node" / "dist" / "clawhermes.js"
PORTAL_URL = "http://127.0.0.1:17000/"


def run_dispatcher(*args, env=None):
    return run_dispatcher_for_root(ROOT, *args, env=env)


def run_dispatcher_for_root(usb_root, *args, env=None):
    command = [
        "node",
        str(NODE_CLI),
        *args,
        "--usb-root",
        str(usb_root),
    ]
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, **(env or {})},
    )


def run_powershell_dispatcher(*args, env=None):
    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(DISPATCHER),
        *args,
    ]
    return subprocess.run(
        command,
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        env={**os.environ, **(env or {})},
    )


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
    return subprocess.run(
        command,
        cwd=root,
        text=True,
        capture_output=True,
        env={**os.environ, **(env or {})},
    )


def fetch_portal(timeout=0.5):
    with urllib.request.urlopen(PORTAL_URL, timeout=timeout) as response:
        return response.read().decode("utf-8")


def fetch_portal_status(timeout=0.5):
    with urllib.request.urlopen(f"{PORTAL_URL}status.json", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_portal_setup(timeout=0.5):
    with urllib.request.urlopen(f"{PORTAL_URL}setup.json", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_portal_backups(timeout=0.5):
    with urllib.request.urlopen(f"{PORTAL_URL}backups.json", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_portal_adapter_verification(timeout=0.5):
    with urllib.request.urlopen(f"{PORTAL_URL}adapter-verification.json", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_portal_logs(timeout=0.5):
    with urllib.request.urlopen(f"{PORTAL_URL}logs.json", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_portal_operations(timeout=0.5):
    with urllib.request.urlopen(f"{PORTAL_URL}operations.json", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_portal():
    deadline = time.time() + 5
    last_error = None
    while time.time() < deadline:
        try:
            return fetch_portal()
        except (OSError, urllib.error.URLError) as exc:
            last_error = exc
            time.sleep(0.1)
    raise AssertionError(f"Portal did not become reachable: {last_error}")


def assert_portal_unreachable(testcase):
    deadline = time.time() + 3
    while time.time() < deadline:
        try:
            fetch_portal(timeout=0.2)
        except (OSError, urllib.error.URLError):
            return
        time.sleep(0.1)
    testcase.fail("Portal was still reachable after stop")


def make_temp_usb_root():
    temp_dir = tempfile.TemporaryDirectory()
    temp_root = Path(temp_dir.name)
    adapters_root = temp_root / "adapters"
    env_root = temp_root / "config" / "env"
    adapters_root.mkdir(parents=True)
    env_root.mkdir(parents=True)

    for adapter_file in (ROOT / "adapters").glob("*/adapter.json"):
        target = adapters_root / adapter_file.parent.name
        target.mkdir(parents=True)
        (target / "adapter.json").write_text(adapter_file.read_text(encoding="utf-8"), encoding="utf-8")

    for example_file in (ROOT / "config" / "env").glob("*.env.example"):
        (env_root / example_file.name).write_text(example_file.read_text(encoding="utf-8"), encoding="utf-8")

    return temp_dir, temp_root


def make_temp_skeleton_usb_root():
    temp_dir, temp_root = make_temp_usb_root()
    for directory in [
        temp_root / "config" / "defaults",
        temp_root / "data" / "logs",
        temp_root / "data" / "tmp",
        temp_root / "portal",
    ]:
        directory.mkdir(parents=True, exist_ok=True)
    for config_file in (ROOT / "config" / "defaults").glob("*.json"):
        (temp_root / "config" / "defaults" / config_file.name).write_text(config_file.read_text(encoding="utf-8"), encoding="utf-8")
    for service_id in ("openclaw", "hermes-agent", "hermes-web-ui"):
        app_dir = temp_root / "apps" / service_id
        data_dir = temp_root / "data" / service_id
        app_dir.mkdir(parents=True, exist_ok=True)
        data_dir.mkdir(parents=True, exist_ok=True)
        (app_dir / ".gitkeep").write_text("", encoding="utf-8")
        (data_dir / ".gitkeep").write_text("", encoding="utf-8")
    copy_portal_dist(temp_root)
    return temp_dir, temp_root


def copy_portal_dist(temp_root):
    target = temp_root / "core" / "node" / "dist"
    target.mkdir(parents=True, exist_ok=True)
    shutil.copytree(ROOT / "core" / "node" / "dist", target, dirs_exist_ok=True)


def make_hermes_agent_app_ready(temp_root):
    app_dir = temp_root / "apps" / "hermes-agent"
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / "pyproject.toml").write_text("[project]\nname = \"hermes-agent-test\"\n", encoding="utf-8")


def make_fake_wsl_cmd(temp_root, stay_running=True, marker_path=None, args_path=None, stop_marker_path=None, list_distribution="Ubuntu"):
    fake_wsl = temp_root / "fake-wsl.cmd"
    marker = marker_path or (temp_root / "data" / "tmp" / "fake-wsl-started.txt")
    args = args_path or (temp_root / "data" / "tmp" / "fake-wsl-args.txt")
    stop_marker = stop_marker_path or (temp_root / "data" / "tmp" / "fake-wsl-stopped.txt")
    marker.parent.mkdir(parents=True, exist_ok=True)
    args.parent.mkdir(parents=True, exist_ok=True)
    stop_marker.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "@echo off",
        "if \"%~1\"==\"--status\" (",
        "  echo Default Version: 2",
        "  exit /b 0",
        ")",
        "if \"%~1\"==\"--list\" (",
        "  echo   NAME      STATE           VERSION",
        f"  echo * {list_distribution}    Running         2",
            "  exit /b 0",
        ")",
        f"echo started > \"{marker}\"",
        f"echo %* > \"{args}\"",
        "echo %* | findstr /C:\"WSL_STOP_HOOK\" > nul",
        "if not errorlevel 1 (",
        f"  echo stopped > \"{stop_marker}\"",
        "  echo fake wsl stopped",
        "  exit /b 0",
        ")",
    ]
    if stay_running:
        lines.extend([
            ":loop",
            "ping -n 2 127.0.0.1 > nul",
            "goto loop",
        ])
    else:
        lines.extend([
            "echo fake wsl completed",
            "exit /b 0",
        ])
    lines.append("")
    fake_wsl.write_text("\n".join(lines), encoding="ascii")
    return fake_wsl


def create_local_source_repo(parent, name="source-app"):
    source_repo = parent / name
    source_repo.mkdir(parents=True)
    subprocess.run(["git", "init", "--initial-branch", "main"], cwd=source_repo, text=True, capture_output=True, check=True)
    (source_repo / "README.md").write_text("# Local source app\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=source_repo, text=True, capture_output=True, check=True)
    subprocess.run(
        ["git", "-c", "user.name=ClawHermes Tests", "-c", "user.email=tests@example.invalid", "commit", "-m", "seed"],
        cwd=source_repo,
        text=True,
        capture_output=True,
        check=True,
    )
    return source_repo


def rewrite_adapter_upstream(temp_root, service_id, repository_url):
    adapter_path = temp_root / "adapters" / service_id / "adapter.json"
    adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
    adapter["upstream"]["repositoryUrl"] = str(repository_url)
    adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")


def configure_fake_setup_command(temp_root):
    adapter_path = temp_root / "adapters" / "fake-service" / "adapter.json"
    adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
    adapter["commands"]["setup"] = "node setup.js"
    adapter["integration"]["status"] = "candidate"
    adapter["integration"]["productionReady"] = False
    adapter["integration"]["verifiedAt"] = None
    adapter["integration"]["summary"] = "Setup command configured for verification tests."
    adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
    (temp_root / "apps" / "fake-service" / "setup.js").write_text(
        "\n".join(
            [
                "const fs = require('node:fs');",
                "const path = require('node:path');",
                "const root = process.env.USB_ROOT;",
                "const out = path.join(root, 'data', 'tmp', 'fake-setup.json');",
                "fs.writeFileSync(out, JSON.stringify({",
                "  cwd: process.cwd(),",
                "  fakeSecret: process.env.FAKE_SECRET,",
                "  fakeInline: process.env.FAKE_INLINE",
                "}, null, 2));",
                "",
            ]
        ),
        encoding="utf-8",
    )


def mark_fake_service_candidate(temp_root):
    adapter_path = temp_root / "adapters" / "fake-service" / "adapter.json"
    adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
    adapter["integration"]["status"] = "candidate"
    adapter["integration"]["productionReady"] = False
    adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")


def mark_adapter_production_ready(temp_root, service_id):
    adapter_path = temp_root / "adapters" / service_id / "adapter.json"
    adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
    adapter["integration"]["status"] = "verified"
    adapter["integration"]["productionReady"] = True
    adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")


def make_temp_process_usb_root():
    temp_dir = tempfile.TemporaryDirectory()
    temp_root = Path(temp_dir.name)
    for directory in [
        temp_root / "adapters" / "fake-service",
        temp_root / "apps" / "fake-service",
        temp_root / "config" / "defaults",
        temp_root / "config" / "env",
        temp_root / "core" / "node" / "dist",
        temp_root / "data" / "logs",
        temp_root / "data" / "tmp",
        temp_root / "portal",
    ]:
        directory.mkdir(parents=True, exist_ok=True)

    adapter = {
        "id": "fake-service",
        "displayName": "Fake Service",
        "description": "Temporary production-ready service used by tests.",
        "type": "node-service",
        "enabled": True,
        "appDir": "apps/fake-service",
        "runtime": {
            "kind": "node",
            "platform": "windows",
            "requiredExecutable": "node.exe",
        },
        "commands": {
            "setup": None,
            "start": "node service.js",
            "stop": None,
        },
        "env": {
            "files": [
                "config/env/fake.env",
            ],
            "variables": {
                "FAKE_INLINE": "${USB_ROOT}/data/fake-service",
            },
        },
        "dataDir": "data/fake-service",
        "logFile": "data/logs/fake-service.log",
        "pidFile": "data/tmp/pids/fake-service.pid",
        "health": {
            "type": "process",
            "timeoutSeconds": 5,
        },
        "portal": {
            "label": "Fake Service",
            "url": None,
            "group": "Tests",
        },
        "integration": {
            "status": "verified",
            "productionReady": True,
            "verifiedAt": "2026-04-30",
            "summary": "Test-only adapter.",
            "sources": [],
        },
        "dependsOn": [],
    }
    (temp_root / "adapters" / "fake-service" / "adapter.json").write_text(
        json.dumps(adapter, indent=2),
        encoding="utf-8",
    )
    (temp_root / "config" / "defaults" / "services.json").write_text(
        json.dumps({"startOrder": ["fake-service"], "stopOrder": ["fake-service"]}, indent=2),
        encoding="utf-8",
    )
    (temp_root / "config" / "defaults" / "ports.json").write_text(
        json.dumps({"portal": 17000}, indent=2),
        encoding="utf-8",
    )
    (temp_root / "config" / "defaults" / "runtimes.json").write_text(
        json.dumps({"platform": "windows", "runtimes": []}, indent=2),
        encoding="utf-8",
    )
    (temp_root / "config" / "env" / "fake.env").write_text("FAKE_SECRET=from-env-file\n", encoding="utf-8")
    copy_portal_dist(temp_root)
    (temp_root / "apps" / "fake-service" / "service.js").write_text(
        "\n".join(
            [
                "const fs = require('node:fs');",
                "const path = require('node:path');",
                "const root = process.env.USB_ROOT;",
                "const out = path.join(root, 'data', 'tmp', 'fake-service-env.json');",
                "fs.writeFileSync(out, JSON.stringify({",
                "  FAKE_SECRET: process.env.FAKE_SECRET,",
                "  FAKE_INLINE: process.env.FAKE_INLINE,",
                "  USB_ROOT: process.env.USB_ROOT",
                "}, null, 2));",
                "setInterval(() => {}, 1000);",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return temp_dir, temp_root


def free_tcp_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def make_temp_http_usb_root(health_port=None):
    temp_dir = tempfile.TemporaryDirectory()
    temp_root = Path(temp_dir.name)
    port = health_port or free_tcp_port()
    for directory in [
        temp_root / "adapters" / "http-service",
        temp_root / "apps" / "http-service",
        temp_root / "config" / "defaults",
        temp_root / "config" / "env",
        temp_root / "core" / "node" / "dist",
        temp_root / "data" / "logs",
        temp_root / "data" / "tmp",
        temp_root / "portal",
    ]:
        directory.mkdir(parents=True, exist_ok=True)

    adapter = {
        "id": "http-service",
        "displayName": "HTTP Service",
        "description": "Temporary HTTP service used by tests.",
        "type": "node-service",
        "enabled": True,
        "appDir": "apps/http-service",
        "runtime": {
            "kind": "node",
            "platform": "windows",
            "requiredExecutable": "node.exe",
        },
        "commands": {
            "setup": None,
            "start": "node service.js",
            "stop": None,
        },
        "env": {
            "files": [],
            "variables": {
                "HTTP_HEALTH_PORT": str(port),
            },
        },
        "dataDir": "data/http-service",
        "logFile": "data/logs/http-service.log",
        "pidFile": "data/tmp/pids/http-service.pid",
        "health": {
            "type": "http",
            "url": f"http://127.0.0.1:{port}/health",
            "timeoutSeconds": 2,
        },
        "portal": {
            "label": "HTTP Service",
            "url": f"http://127.0.0.1:{port}",
            "group": "Tests",
        },
        "integration": {
            "status": "verified",
            "productionReady": True,
            "verifiedAt": "2026-05-01",
            "summary": "Test-only HTTP adapter.",
            "sources": [],
        },
        "dependsOn": [],
    }
    (temp_root / "adapters" / "http-service" / "adapter.json").write_text(
        json.dumps(adapter, indent=2),
        encoding="utf-8",
    )
    (temp_root / "config" / "defaults" / "services.json").write_text(
        json.dumps({"startOrder": ["http-service"], "stopOrder": ["http-service"]}, indent=2),
        encoding="utf-8",
    )
    (temp_root / "config" / "defaults" / "ports.json").write_text(
        json.dumps({"portal": 17000}, indent=2),
        encoding="utf-8",
    )
    (temp_root / "config" / "defaults" / "runtimes.json").write_text(
        json.dumps({"platform": "windows", "runtimes": []}, indent=2),
        encoding="utf-8",
    )
    copy_portal_dist(temp_root)
    (temp_root / "apps" / "http-service" / "service.js").write_text(
        "\n".join(
            [
                "const http = require('node:http');",
                "const port = Number(process.env.HTTP_HEALTH_PORT);",
                "const server = http.createServer((req, res) => {",
                "  if (req.url === '/health') {",
                "    res.writeHead(200, {'content-type': 'text/plain'});",
                "    res.end('ok');",
                "    return;",
                "  }",
                "  res.writeHead(404, {'content-type': 'text/plain'});",
                "  res.end('missing');",
                "});",
                "server.listen(port, '127.0.0.1');",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return temp_dir, temp_root, port


def wait_for_file(path):
    deadline = time.time() + 5
    while time.time() < deadline:
        if path.exists():
            return
        time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for {path}")


def wait_for_url(url):
    deadline = time.time() + 5
    last_error = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=0.3) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError) as exc:
            last_error = exc
            time.sleep(0.1)
    raise AssertionError(f"Timed out waiting for {url}: {last_error}")


def process_exists(pid):
    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            f"if (Get-Process -Id {pid} -ErrorAction SilentlyContinue) {{ 'true' }} else {{ 'false' }}",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    return result.stdout.strip().lower() == "true"


def wait_for_process_exit(pid):
    deadline = time.time() + 5
    while time.time() < deadline:
        if not process_exists(pid):
            return
        time.sleep(0.1)
    raise AssertionError(f"Process {pid} was still running")


class WindowsCoreTests(unittest.TestCase):
    def setUp(self):
        pid_dir = ROOT / "data" / "tmp" / "pids"
        if pid_dir.exists():
            for pid_file in pid_dir.glob("*.pid"):
                pid_file.unlink()
        launcher_log = ROOT / "data" / "logs" / "launcher.log"
        if launcher_log.exists():
            launcher_log.unlink()
        portal_index = ROOT / "portal" / "index.html"
        if portal_index.exists():
            portal_index.unlink()
        run_dispatcher("stop", "-Json")

    def test_env_json_resolves_root_and_portable_environment(self):
        result = run_dispatcher("env-json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)

        self.assertEqual(Path(payload["USB_ROOT"]).resolve(), ROOT)
        self.assertEqual(Path(payload["HOME"]).resolve(), ROOT / "data" / "home")
        self.assertEqual(Path(payload["USERPROFILE"]).resolve(), ROOT / "data" / "home")
        self.assertEqual(
            Path(payload["APPDATA"]).resolve(),
            ROOT / "data" / "home" / "AppData" / "Roaming",
        )
        self.assertEqual(
            Path(payload["LOCALAPPDATA"]).resolve(),
            ROOT / "data" / "home" / "AppData" / "Local",
        )
        self.assertEqual(Path(payload["TEMP"]).resolve(), ROOT / "data" / "tmp")
        self.assertEqual(Path(payload["TMP"]).resolve(), ROOT / "data" / "tmp")
        self.assertEqual(Path(payload["HERMES_HOME"]).resolve(), ROOT / "data" / "hermes")
        self.assertEqual(
            Path(payload["npm_config_cache"]).resolve(),
            ROOT / "data" / "cache" / "npm",
        )
        self.assertEqual(
            Path(payload["PIP_CACHE_DIR"]).resolve(),
            ROOT / "data" / "cache" / "pip",
        )
        self.assertEqual(
            Path(payload["UV_CACHE_DIR"]).resolve(),
            ROOT / "data" / "cache" / "uv",
        )

    def test_windows_batch_launchers_forward_exit_codes_and_start_opens_portal(self):
        launchers = {
            "Setup.bat": "setup",
            "Start.bat": "start",
            "Stop.bat": "stop",
            "Status.bat": "status",
            "Backup.bat": "backup",
        }

        for file_name, action in launchers.items():
            text = (ROOT / "launcher" / "windows" / file_name).read_text(encoding="utf-8")
            self.assertIn(f"clawhermes.ps1\" {action} -UsbRoot", text)
            self.assertIn("set CLAWHERMES_EXIT=%ERRORLEVEL%", text)
            self.assertIn("endlocal & exit /b %CLAWHERMES_EXIT%", text)

        start_text = (ROOT / "launcher" / "windows" / "Start.bat").read_text(encoding="utf-8")
        self.assertIn("data\\tmp\\ports.json", start_text)
        self.assertIn('if "%CLAWHERMES_EXIT%"=="0" start "" "%CLAWHERMES_PORTAL_URL%"', start_text)

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
            lines = (ROOT / "launcher" / "windows" / file_name).read_text(encoding="utf-8").splitlines()
            self.assertEqual(
                lines,
                [
                    "@echo off",
                    "setlocal",
                    "set SCRIPT_DIR=%~dp0",
                    'for %%I in ("%SCRIPT_DIR%..\\..") do set USB_ROOT=%%~fI',
                    f'powershell -NoProfile -ExecutionPolicy Bypass -File "%USB_ROOT%\\launcher\\windows\\UserGuide.ps1" -Mode {mode} -UsbRoot "%USB_ROOT%"',
                    "set CLAWHERMES_EXIT=%ERRORLEVEL%",
                    "endlocal & exit /b %CLAWHERMES_EXIT%",
                ],
            )

    def test_user_guide_script_exposes_safe_modes_and_noninteractive_switches(self):
        text = (ROOT / "launcher" / "windows" / "UserGuide.ps1").read_text(encoding="utf-8")

        self.assertIn('[ValidateSet("Install", "Start", "Stop", "Status", "Backup", "Uninstall", "Repair")]', text)
        self.assertIn("[switch]$NoPause", text)
        self.assertIn("[switch]$AssumeYes", text)
        self.assertIn("[switch]$PlanOnly", text)
        self.assertIn("core\\windows\\clawhermes.ps1", text)
        self.assertIn("data\\logs", text)
        self.assertNotIn("setx ", text.lower())

    def test_user_guide_status_runs_without_pausing_and_prints_services(self):
        result = run_user_guide("Status")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ClawHermes-USB", result.stdout)
        self.assertIn("USB root:", result.stdout)
        self.assertIn("openclaw:", result.stdout)
        self.assertIn("Portal:", result.stdout)

    def test_user_guide_start_opens_runtime_portal_url_text(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            guide_path = temp_root / "launcher" / "windows" / "UserGuide.ps1"
            guide_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / "launcher" / "windows" / "UserGuide.ps1", guide_path)

            dispatcher_path = temp_root / "core" / "windows" / "clawhermes.ps1"
            dispatcher_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / "core" / "windows" / "clawhermes.ps1", dispatcher_path)

            stdout_path = temp_root / "data" / "tmp" / "user-guide-start.stdout"
            stderr_path = temp_root / "data" / "tmp" / "user-guide-start.stderr"
            with stdout_path.open("w", encoding="utf-8") as stdout_handle, stderr_path.open("w", encoding="utf-8") as stderr_handle:
                result = subprocess.run(
                    [
                        "powershell",
                        "-NoProfile",
                        "-ExecutionPolicy",
                        "Bypass",
                        "-File",
                        str(guide_path),
                        "-Mode",
                        "Start",
                        "-UsbRoot",
                        str(temp_root),
                        "-NoPause",
                    ],
                    cwd=temp_root,
                    text=True,
                    stdout=stdout_handle,
                    stderr=stderr_handle,
                    check=False,
                    env=os.environ.copy(),
                )

            stdout_text = stdout_path.read_text(encoding="utf-8")
            stderr_text = stderr_path.read_text(encoding="utf-8")
            self.assertEqual(result.returncode, 0, stderr_text)
            self.assertIn("Start", stdout_text)
            self.assertIn("Portal: http://127.0.0.1:", stdout_text)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_user_guide_backup_creates_data_backup_without_uninstall_words(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            guide_path = temp_root / "launcher" / "windows" / "UserGuide.ps1"
            guide_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / "launcher" / "windows" / "UserGuide.ps1", guide_path)

            dispatcher_path = temp_root / "core" / "windows" / "clawhermes.ps1"
            dispatcher_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / "core" / "windows" / "clawhermes.ps1", dispatcher_path)

            result = run_user_guide("Backup", root=temp_root)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Backup", result.stdout)
            self.assertNotIn("unregister", result.stdout.lower())
            self.assertNotIn("ClawHermes-Ubuntu", result.stdout)
        finally:
            temp_dir.cleanup()

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

    def test_user_guide_uninstall_plan_only_does_not_stop_running_services(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            guide_path = temp_root / "launcher" / "windows" / "UserGuide.ps1"
            guide_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / "launcher" / "windows" / "UserGuide.ps1", guide_path)

            dispatcher_path = temp_root / "core" / "windows" / "clawhermes.ps1"
            dispatcher_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / "core" / "windows" / "clawhermes.ps1", dispatcher_path)

            start = run_dispatcher_for_root(temp_root, "start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            start_payload = json.loads(start.stdout)
            wait_for_url(start_payload["portal"]["url"])
            portal_pid = temp_root / "data" / "tmp" / "pids" / "portal.pid"
            self.assertTrue(portal_pid.exists())

            result = run_user_guide("Uninstall", "-PlanOnly", root=temp_root)

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Plan-only mode finished", result.stdout)
            self.assertTrue(portal_pid.exists())

            status = run_dispatcher_for_root(temp_root, "status", "-Json")
            self.assertEqual(status.returncode, 0, status.stderr)
            services = {service["id"]: service for service in json.loads(status.stdout)["services"]}
            self.assertEqual(services["portal"]["status"], "running")
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_setup_json_reports_runtime_diagnostics_and_valid_adapters(self):
        result = run_dispatcher("setup", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)

        adapter_ids = {adapter["id"] for adapter in payload["adapters"]}
        self.assertEqual(adapter_ids, {"openclaw", "hermes-agent", "hermes-web-ui"})
        self.assertTrue(all(adapter["valid"] for adapter in payload["adapters"]))

        runtime_names = {runtime["name"] for runtime in payload["runtimes"]}
        self.assertEqual(runtime_names, {"node", "python", "git"})
        missing = [runtime for runtime in payload["runtimes"] if not runtime["found"]]
        self.assertEqual({runtime["name"] for runtime in missing}, {"node", "python", "git"})
        node_runtime = next(runtime for runtime in payload["runtimes"] if runtime["name"] == "node")
        python_runtime = next(runtime for runtime in payload["runtimes"] if runtime["name"] == "python")
        git_runtime = next(runtime for runtime in payload["runtimes"] if runtime["name"] == "git")
        self.assertEqual(node_runtime["versionPolicy"], "lts")
        self.assertIn("nodejs.org", node_runtime["sourceUrl"])
        self.assertIn("embeddable", python_runtime["packageType"])
        self.assertIn("python.org", python_runtime["sourceUrl"])
        self.assertIn("Portable", git_runtime["packageType"])
        self.assertIn("git-scm.com", git_runtime["sourceUrl"])
        self.assertTrue(any(candidate.endswith("node.exe") for candidate in node_runtime["candidates"]))
        self.assertTrue(any(candidate.endswith("python.exe") for candidate in python_runtime["candidates"]))
        self.assertTrue(any(candidate.endswith("git.exe") for candidate in git_runtime["candidates"]))

        self.assertTrue(payload["dataWritable"])
        self.assertIn("Portable Node.js not found", "\n".join(payload["messages"]))
        self.assertIn("Portable Python not found", "\n".join(payload["messages"]))
        self.assertIn("Portable Git not found", "\n".join(payload["messages"]))
        artifact = next(item for item in payload["wslArtifacts"] if item["serviceId"] == "hermes-agent")
        self.assertEqual(artifact["distro"], "Ubuntu")
        expected_archive = ROOT / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
        expected_checksum = ROOT / "runtimes" / "wsl" / "ubuntu-rootfs.tar.sha256"
        self.assertEqual(artifact["sourceArchiveExists"], expected_archive.exists())
        self.assertEqual(artifact["checksum"]["exists"], expected_checksum.exists())
        self.assertTrue(artifact["archivePath"].replace("\\", "/").endswith("runtimes/wsl/ubuntu-rootfs.tar"))
        self.assertIn("wsl-rootfs-guide --distro Ubuntu --json", artifact["guideCommand"])
        self.assertIn("wsl-import-plan --distro Ubuntu --json", artifact["importPlanCommand"])
        artifact_services = {item["serviceId"] for item in payload["wslArtifacts"]}
        self.assertIn("openclaw", artifact_services)

    def test_setup_json_reports_recommended_actions(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            result = run_dispatcher_for_root(temp_root, "setup", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            actions = payload["actions"]
            categories = {action["category"] for action in actions}
            action_ids = {action["id"] for action in actions}

            self.assertIn("runtime", categories)
            self.assertIn("env-file", categories)
            self.assertIn("wsl-artifact", categories)
            self.assertIn("runtime:node", action_ids)
            self.assertNotIn("adapter-integration:openclaw", action_ids)
            self.assertNotIn("adapter-integration:hermes-agent", action_ids)
            self.assertNotIn("adapter-integration:hermes-web-ui", action_ids)
            self.assertIn("env-file:hermes-agent", action_ids)
            self.assertIn("wsl-artifact:hermes-agent", action_ids)
            self.assertIn("wsl-artifact:openclaw", action_ids)

            node_action = next(action for action in actions if action["id"] == "runtime:node")
            self.assertEqual(node_action["severity"], "warning")
            self.assertIn("runtimes", node_action["command"])

            env_action = next(action for action in actions if action["id"] == "env-file:hermes-agent")
            self.assertIn("init-env", env_action["command"])
            self.assertEqual(env_action["path"].replace("\\", "/"), "config/env/hermes.env")

            artifact_action = next(action for action in actions if action["id"] == "wsl-artifact:hermes-agent")
            self.assertEqual(artifact_action["severity"], "warning")
            self.assertIn("wsl-rootfs-guide", artifact_action["command"])
        finally:
            temp_dir.cleanup()

    def test_setup_wizard_json_reports_ordered_read_only_phases(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            result = run_dispatcher_for_root(temp_root, "setup-wizard", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            phase_ids = [phase["id"] for phase in payload["phases"]]

            self.assertFalse(payload["wouldModify"])
            self.assertEqual(
                phase_ids,
                [
                    "diagnose",
                    "prepare-runtimes",
                    "prepare-wsl2",
                    "initialize-env",
                    "payloads",
                    "setup-adapters",
                    "start-and-verify",
                    "backup-and-release",
                ],
            )
            commands = "\n".join(command["command"] for phase in payload["phases"] for command in phase["commands"])
            self.assertIn("setup --json", commands)
            self.assertIn("init-env --dry-run --json", commands)
            self.assertIn("payloads --json", commands)
            self.assertIn("payload-export --dry-run --json", commands)
            self.assertIn("setup-adapter hermes-agent --dry-run --json", commands)
            self.assertIn("setup-adapter hermes-agent --confirm-setup --json", commands)
            self.assertIn("start --json", commands)
            self.assertIn("verify-adapter hermes-agent --json", commands)
            self.assertIn("docs/release-checklist.md", payload["releaseChecklist"])
            self.assertFalse((temp_root / "data" / "tmp" / "ports.json").exists())
        finally:
            temp_dir.cleanup()

    def test_wsl_json_reports_missing_host_wsl_without_throwing(self):
        missing_wsl = str(ROOT / "data" / "tmp" / "missing-wsl.exe")

        result = run_dispatcher("wsl", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(Path(payload["root"]).resolve(), ROOT)
        self.assertEqual(payload["executablePath"], missing_wsl)
        self.assertFalse(payload["found"])
        self.assertFalse(payload["hasWsl2Distro"])
        self.assertIn("wsl.exe not found", "\n".join(payload["messages"]))

    def test_wsl_json_reports_desired_distro(self):
        missing_wsl = str(ROOT / "data" / "tmp" / "missing-wsl.exe")

        result = run_dispatcher("wsl", "--distro", "Ubuntu", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["desiredDistro"], "Ubuntu")
        self.assertFalse(payload["hasDesiredDistro"])
        self.assertIsNone(payload["desiredDistroVersion"])

    def test_prepare_wsl_dry_run_reports_guarded_host_install_plan(self):
        missing_wsl = str(ROOT / "data" / "tmp" / "missing-wsl.exe")

        result = run_dispatcher("prepare-wsl", "--distro", "Ubuntu", "--dry-run", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["dryRun"])
        self.assertFalse(payload["confirmedInstall"])
        self.assertFalse(payload["executed"])
        self.assertEqual(payload["distro"], "Ubuntu")
        self.assertTrue(payload["wouldModifyHost"])
        self.assertIn("host-level", "\n".join(payload["hostChanges"]))
        self.assertGreaterEqual(len(payload["commands"]), 1)
        command = payload["commands"][0]
        self.assertEqual(command["id"], "install-distro")
        self.assertIn("--install", command["args"])
        self.assertIn("-d", command["args"])
        self.assertIn("Ubuntu", command["args"])
        self.assertTrue(command["requiresUserConsent"])
        self.assertTrue(command["mayRequireAdmin"])
        self.assertTrue(command["mayRequireReboot"])
        self.assertFalse(payload["portableImport"]["automatic"])
        self.assertIn("wsl --import", payload["portableImport"]["summary"])

    def test_prepare_wsl_requires_confirm_install_without_dry_run(self):
        missing_wsl = str(ROOT / "data" / "tmp" / "missing-wsl.exe")

        result = run_dispatcher("prepare-wsl", "--distro", "Ubuntu", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--confirm-install", result.stderr)

    def test_wsl_workflow_reports_explicit_confirm_commands_for_hermes_agent(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        missing_wsl = str(temp_root / "data" / "tmp" / "missing-wsl.exe")
        try:
            result = run_dispatcher_for_root(temp_root, "wsl-workflow", "hermes-agent", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["serviceId"], "hermes-agent")
            self.assertEqual(payload["runner"], "wsl2")
            self.assertEqual(payload["distro"], "ClawHermes-Ubuntu")
            self.assertEqual(payload["sourceDistro"], "Ubuntu")
            self.assertFalse(payload["wslReady"])
            self.assertTrue(payload["stopHookDeclared"])
            phase_ids = [phase["id"] for phase in payload["phases"]]
            self.assertEqual(
                phase_ids,
                [
                    "diagnose",
                    "prepare-host",
                    "prepare-rootfs",
                    "import-distro",
                    "checkout-source",
                    "setup-adapter",
                    "start-adapter",
                    "verify-adapter",
                    "mark-ready",
                    "export-backup",
                    "unregister-distro",
                ],
            )
            phases = {phase["id"]: phase for phase in payload["phases"]}
            self.assertFalse(phases["diagnose"]["modifiesHost"])
            self.assertFalse(phases["diagnose"]["modifiesProject"])
            self.assertIn("wsl --distro ClawHermes-Ubuntu --json", phases["diagnose"]["command"])
            self.assertIn("prepare-wsl --distro Ubuntu --dry-run --json", phases["prepare-host"]["command"])
            self.assertIn("--confirm-install", phases["prepare-host"]["confirmCommand"])
            self.assertTrue(phases["prepare-host"]["modifiesHost"])
            self.assertIn("wsl-rootfs-guide --distro Ubuntu --json", phases["prepare-rootfs"]["command"])
            self.assertIsNone(phases["prepare-rootfs"]["confirmCommand"])
            self.assertFalse(phases["prepare-rootfs"]["modifiesHost"])
            self.assertFalse(phases["prepare-rootfs"]["modifiesProject"])
            self.assertIn("wsl-import-plan --distro Ubuntu --json", phases["import-distro"]["command"])
            self.assertIn("wsl-import --distro Ubuntu --confirm-import --json", phases["import-distro"]["confirmCommand"])
            self.assertTrue(phases["import-distro"]["modifiesHost"])
            self.assertTrue(phases["import-distro"]["modifiesProject"])
            self.assertFalse(phases["import-distro"]["sourceArchiveExists"])
            self.assertIn("--dry-run", phases["checkout-source"]["command"])
            self.assertIn("--confirm-checkout", phases["checkout-source"]["confirmCommand"])
            self.assertIn("--confirm-setup", phases["setup-adapter"]["confirmCommand"])
            self.assertIn("--confirm-start", phases["start-adapter"]["confirmCommand"])
            self.assertIn("verify-adapter hermes-agent --json", phases["verify-adapter"]["command"])
            self.assertIn("--confirm-ready", phases["mark-ready"]["confirmCommand"])
            self.assertIn("wsl-export --distro Ubuntu --confirm-export --json", phases["export-backup"]["confirmCommand"])
            self.assertFalse(phases["export-backup"]["modifiesHost"])
            self.assertTrue(phases["export-backup"]["modifiesProject"])
            self.assertIn("wsl-unregister-plan --distro Ubuntu --json", phases["unregister-distro"]["command"])
            self.assertIn("wsl-unregister --distro Ubuntu --confirm-unregister --json", phases["unregister-distro"]["confirmCommand"])
            self.assertTrue(phases["unregister-distro"]["modifiesHost"])
            self.assertFalse(phases["unregister-distro"]["modifiesProject"])
            self.assertFalse(phases["unregister-distro"]["latestBackupExists"])
        finally:
            temp_dir.cleanup()

    def test_wsl_import_plan_reports_usb_storage_command_without_running_wsl(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            result = run_dispatcher_for_root(temp_root, "wsl-import-plan", "--distro", "Ubuntu", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["executed"])
            self.assertEqual(payload["distro"], "Ubuntu")
            self.assertEqual(payload["distributionName"], "ClawHermes-Ubuntu")
            self.assertTrue(payload["installLocation"].replace("\\", "/").endswith("data/wsl/ClawHermes-Ubuntu"))
            self.assertFalse(payload["installLocationExists"])
            self.assertTrue(payload["sourceArchive"].replace("\\", "/").endswith("runtimes/wsl/ubuntu-rootfs.tar"))
            self.assertFalse(payload["sourceArchiveExists"])
            self.assertTrue(payload["wouldModifyHost"])
            self.assertTrue(payload["wouldUseProjectStorage"])
            self.assertIn("--import", payload["args"])
            self.assertIn("--version", payload["args"])
            self.assertIn("2", payload["args"])
            self.assertIn("registered on this Windows host", "\n".join(payload["messages"]))
            self.assertIn("learn.microsoft.com", payload["docs"])
            policy = payload["artifactPolicy"]
            self.assertFalse(policy["automaticDownload"])
            self.assertEqual(policy["archiveName"], "ubuntu-rootfs.tar")
            self.assertTrue(policy["directory"].replace("\\", "/").endswith("runtimes/wsl"))
            self.assertTrue(policy["checksumFile"].replace("\\", "/").endswith("runtimes/wsl/ubuntu-rootfs.tar.sha256"))
            self.assertTrue(policy["mustRemainProjectLocal"])
            self.assertTrue(policy["mustNotUseSystemTemp"])
            self.assertIn("No automatic rootfs download", "\n".join(payload["messages"]))
        finally:
            temp_dir.cleanup()

    def test_wsl_rootfs_guide_reports_manual_export_and_hash_steps(self):
        result = run_dispatcher("wsl-rootfs-guide", "--distro", "Ubuntu", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["distro"], "Ubuntu")
        self.assertFalse(payload["automaticDownload"])
        self.assertTrue(payload["archivePath"].replace("\\", "/").endswith("runtimes/wsl/ubuntu-rootfs.tar"))
        self.assertTrue(payload["checksumPath"].replace("\\", "/").endswith("runtimes/wsl/ubuntu-rootfs.tar.sha256"))
        self.assertIn("--export Ubuntu", payload["exportCommand"])
        self.assertIn("Get-FileHash", payload["checksumCommand"])
        next_commands = "\n".join(payload["nextCommands"])
        self.assertIn("wsl-import-plan --distro Ubuntu --json", next_commands)
        self.assertIn("wsl-import --distro Ubuntu --confirm-import --json", next_commands)
        self.assertIn("learn.microsoft.com", payload["docs"])
        self.assertIn("ClawHermes-USB does not download", "\n".join(payload["messages"]))

    def test_powershell_wrapper_allows_wsl_import_actions(self):
        payloads = run_powershell_dispatcher("payloads", "-Json")
        self.assertEqual(payloads.returncode, 0, payloads.stderr)
        self.assertFalse(json.loads(payloads.stdout)["wouldModify"])

        wizard = run_powershell_dispatcher("setup-wizard", "-Json")
        self.assertEqual(wizard.returncode, 0, wizard.stderr)
        self.assertFalse(json.loads(wizard.stdout)["wouldModify"])

        guide = run_powershell_dispatcher("wsl-rootfs-guide", "-Json", "--distro", "Ubuntu")
        self.assertEqual(guide.returncode, 0, guide.stderr)
        self.assertEqual(json.loads(guide.stdout)["distro"], "Ubuntu")

        export = run_powershell_dispatcher("wsl-export", "-Json", "--distro", "Ubuntu")
        self.assertNotEqual(export.returncode, 0)
        self.assertIn("--confirm-export", export.stderr)

        unregister = run_powershell_dispatcher("wsl-unregister", "-Json", "--distro", "Ubuntu")
        self.assertNotEqual(unregister.returncode, 0)
        self.assertIn("--confirm-unregister", unregister.stderr)

        result = run_powershell_dispatcher("wsl-import-plan", "-Json", "--distro", "Ubuntu")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["distributionName"], "ClawHermes-Ubuntu")

    def test_gitignore_excludes_wsl_rootfs_payloads(self):
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")

        self.assertIn("runtimes/wsl/*.tar", gitignore)
        self.assertIn("!runtimes/wsl/.gitkeep", gitignore)

    def test_wsl_import_requires_explicit_confirm_import(self):
        result = run_dispatcher("wsl-import", "--distro", "Ubuntu", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--confirm-import", result.stderr)

    def test_wsl_import_confirm_runs_fake_wsl_import_with_project_local_archive(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            archive = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            archive.parent.mkdir(parents=True, exist_ok=True)
            archive.write_text("tiny rootfs placeholder for command test\n", encoding="utf-8")
            marker = temp_root / "data" / "tmp" / "fake-wsl-import.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-import-args.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, stay_running=False, marker_path=marker, args_path=args_file)

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-import",
                "--distro",
                "Ubuntu",
                "--confirm-import",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["executed"])
            self.assertTrue(payload["confirmedImport"])
            self.assertTrue(payload["sourceArchiveExists"])
            self.assertFalse(payload["checksum"]["exists"])
            self.assertFalse(payload["checksum"]["verified"])
            self.assertEqual(payload["executablePath"], str(fake_wsl))
            self.assertTrue(marker.exists())
            args_text = args_file.read_text(encoding="utf-8")
            self.assertIn("--import", args_text)
            self.assertIn("ClawHermes-Ubuntu", args_text)
            self.assertIn(str(archive), args_text)
            self.assertIn("--version 2", args_text)
        finally:
            temp_dir.cleanup()

    def test_wsl_import_verifies_sha256_sidecar_before_running_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            archive = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            archive.parent.mkdir(parents=True, exist_ok=True)
            archive.write_text("tiny rootfs placeholder for checksum test\n", encoding="utf-8")
            checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
            (archive.parent / "ubuntu-rootfs.tar.sha256").write_text(f"{checksum}  ubuntu-rootfs.tar\n", encoding="utf-8")
            marker = temp_root / "data" / "tmp" / "fake-wsl-import.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, stay_running=False, marker_path=marker)

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-import",
                "--distro",
                "Ubuntu",
                "--confirm-import",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["checksum"]["exists"])
            self.assertTrue(payload["checksum"]["verified"])
            self.assertEqual(payload["checksum"]["expected"], checksum)
            self.assertEqual(payload["checksum"]["actual"], checksum)
            self.assertTrue(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_wsl_import_rejects_wrong_sha256_before_running_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            archive = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            archive.parent.mkdir(parents=True, exist_ok=True)
            archive.write_text("tiny rootfs placeholder for checksum failure\n", encoding="utf-8")
            (archive.parent / "ubuntu-rootfs.tar.sha256").write_text("0" * 64 + "  ubuntu-rootfs.tar\n", encoding="utf-8")
            marker = temp_root / "data" / "tmp" / "fake-wsl-import.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, stay_running=False, marker_path=marker)

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-import",
                "--distro",
                "Ubuntu",
                "--confirm-import",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("SHA256 mismatch", result.stderr)
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_wsl_import_rejects_existing_install_location_before_running_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            archive = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            archive.parent.mkdir(parents=True, exist_ok=True)
            archive.write_text("tiny rootfs placeholder for existing install test\n", encoding="utf-8")
            install_location = temp_root / "data" / "wsl" / "ClawHermes-Ubuntu"
            install_location.mkdir(parents=True)
            marker = temp_root / "data" / "tmp" / "fake-wsl-import.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, stay_running=False, marker_path=marker)

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-import",
                "--distro",
                "Ubuntu",
                "--confirm-import",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("install location already exists", result.stderr)
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_wsl_import_rejects_existing_registered_distribution_before_running_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            archive = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            archive.parent.mkdir(parents=True, exist_ok=True)
            archive.write_text("tiny rootfs placeholder for registered distro test\n", encoding="utf-8")
            marker = temp_root / "data" / "tmp" / "fake-wsl-import.txt"
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                stay_running=False,
                marker_path=marker,
                list_distribution="ClawHermes-Ubuntu",
            )

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-import",
                "--distro",
                "Ubuntu",
                "--confirm-import",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("already registered", result.stderr)
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_wsl_unregister_plan_reports_destructive_risk_without_running_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            marker = temp_root / "data" / "tmp" / "fake-wsl-unregister.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-unregister-args.txt"
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                stay_running=False,
                marker_path=marker,
                args_path=args_file,
                list_distribution="ClawHermes-Ubuntu",
            )

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-unregister-plan",
                "--distro",
                "Ubuntu",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["executed"])
            self.assertTrue(payload["wouldModifyHost"])
            self.assertTrue(payload["destructive"])
            self.assertEqual(payload["distributionName"], "ClawHermes-Ubuntu")
            self.assertTrue(payload["registered"])
            self.assertIn("--unregister", payload["args"])
            self.assertIn("wsl.exe --export ClawHermes-Ubuntu", payload["backupCommand"])
            self.assertFalse(payload["latestBackup"]["exists"])
            self.assertIn("wsl-export --distro Ubuntu --confirm-export --json", payload["exportCommand"])
            self.assertTrue(payload["backupArchive"].replace("\\", "/").endswith("data/backups/wsl/ClawHermes-Ubuntu-backup.tar"))
            self.assertIn("--confirm-unregister", payload["confirmCommand"])
            self.assertIn("permanently deletes", "\n".join(payload["warnings"]))
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_wsl_unregister_plan_reports_latest_project_backup(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            backup_dir = temp_root / "data" / "backups" / "wsl"
            backup_dir.mkdir(parents=True)
            old_backup = backup_dir / "ClawHermes-Ubuntu-2026-01-01T00-00-00-000Z.tar"
            latest_backup = backup_dir / "ClawHermes-Ubuntu-2026-02-01T00-00-00-000Z.tar"
            old_backup.write_text("old backup\n", encoding="utf-8")
            latest_backup.write_text("latest backup\n", encoding="utf-8")
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                stay_running=False,
                list_distribution="ClawHermes-Ubuntu",
            )

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-unregister-plan",
                "--distro",
                "Ubuntu",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["latestBackup"]["exists"])
            self.assertEqual(Path(payload["latestBackup"]["path"]).resolve(), latest_backup.resolve())
            self.assertGreater(payload["latestBackup"]["sizeBytes"], 0)
            self.assertIn("Latest backup", "\n".join(payload["messages"]))
        finally:
            temp_dir.cleanup()

    def test_wsl_unregister_requires_explicit_confirm_unregister(self):
        result = run_dispatcher("wsl-unregister", "--distro", "Ubuntu", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--confirm-unregister", result.stderr)

    def test_wsl_unregister_requires_project_backup_before_running_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            marker = temp_root / "data" / "tmp" / "fake-wsl-unregister.txt"
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                stay_running=False,
                marker_path=marker,
                list_distribution="ClawHermes-Ubuntu",
            )

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-unregister",
                "--distro",
                "Ubuntu",
                "--confirm-unregister",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("backup", result.stderr.lower())
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_wsl_unregister_confirm_runs_fake_wsl_after_backup_gate(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            backup_dir = temp_root / "data" / "backups" / "wsl"
            backup_dir.mkdir(parents=True)
            (backup_dir / "ClawHermes-Ubuntu-2026-02-01T00-00-00-000Z.tar").write_text("backup\n", encoding="utf-8")
            marker = temp_root / "data" / "tmp" / "fake-wsl-unregister.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-unregister-args.txt"
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                stay_running=False,
                marker_path=marker,
                args_path=args_file,
                list_distribution="ClawHermes-Ubuntu",
            )

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-unregister",
                "--distro",
                "Ubuntu",
                "--confirm-unregister",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["executed"])
            self.assertTrue(payload["confirmedUnregister"])
            self.assertTrue(payload["latestBackup"]["exists"])
            self.assertEqual(payload["distributionName"], "ClawHermes-Ubuntu")
            self.assertIn("--unregister", payload["args"])
            self.assertTrue(marker.exists())
            args_text = args_file.read_text(encoding="utf-8")
            self.assertIn("--unregister", args_text)
            self.assertIn("ClawHermes-Ubuntu", args_text)
        finally:
            temp_dir.cleanup()

    def test_wsl_export_requires_explicit_confirm_export(self):
        result = run_dispatcher("wsl-export", "--distro", "Ubuntu", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--confirm-export", result.stderr)

    def test_wsl_export_confirm_runs_fake_wsl_export_to_project_backup(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            marker = temp_root / "data" / "tmp" / "fake-wsl-export.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-export-args.txt"
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                stay_running=False,
                marker_path=marker,
                args_path=args_file,
                list_distribution="ClawHermes-Ubuntu",
            )

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-export",
                "--distro",
                "Ubuntu",
                "--confirm-export",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["executed"])
            self.assertTrue(payload["confirmedExport"])
            self.assertEqual(payload["distributionName"], "ClawHermes-Ubuntu")
            self.assertTrue(payload["backupArchive"].replace("\\", "/").startswith(str(temp_root).replace("\\", "/") + "/data/backups/wsl/ClawHermes-Ubuntu-"))
            self.assertIn("--export", payload["args"])
            self.assertTrue(marker.exists())
            args_text = args_file.read_text(encoding="utf-8")
            self.assertIn("--export", args_text)
            self.assertIn("ClawHermes-Ubuntu", args_text)
            self.assertIn(payload["backupArchive"], args_text)
        finally:
            temp_dir.cleanup()

    def test_wsl_export_rejects_system_temp_archive_before_running_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            temp_archive = Path(tempfile.gettempdir()) / "ClawHermes-USB-wsl-export-test.tar"
            marker = temp_root / "data" / "tmp" / "fake-wsl-export.txt"
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                stay_running=False,
                marker_path=marker,
                list_distribution="ClawHermes-Ubuntu",
            )

            result = run_dispatcher_for_root(
                temp_root,
                "wsl-export",
                "--distro",
                "Ubuntu",
                "--archive",
                str(temp_archive),
                "--confirm-export",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("system temp", result.stderr)
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_setup_json_reports_wsl2_actions_when_adapters_need_wsl2(self):
        missing_wsl = str(ROOT / "data" / "tmp" / "missing-wsl.exe")

        result = run_dispatcher("setup", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("wsl", payload)
        self.assertFalse(payload["wsl"]["found"])
        action_ids = {action["id"] for action in payload["actions"]}
        self.assertIn("wsl2:hermes-agent", action_ids)
        self.assertIn("wsl2:openclaw", action_ids)
        action = next(action for action in payload["actions"] if action["id"] == "wsl2:hermes-agent")
        self.assertEqual(action["category"], "wsl2")
        self.assertEqual(action["severity"], "warning")
        self.assertIn("Install or enable WSL2", action["title"])
        self.assertIn("wsl-workflow hermes-agent", action["command"])

    def test_chinese_docs_are_readable_utf8(self):
        docs = [
            ROOT / "README.zh-CN.md",
            ROOT / "docs" / "PRD.zh-CN.md",
            ROOT / "docs" / "DESIGN.zh-CN.md",
            ROOT / "docs" / "ADAPTER_CONTRACT.zh-CN.md",
        ]
        mojibake_markers = ["鏄", "鐨", "鍜", "锛", "銆", "鈥", "�"]
        required_phrases = ["ClawHermes-USB", "便携"]

        for doc in docs:
            text = doc.read_text(encoding="utf-8")
            for marker in mojibake_markers:
                self.assertNotIn(marker, text, f"{doc} contains mojibake marker {marker}")
            for phrase in required_phrases:
                self.assertIn(phrase, text, f"{doc} is missing readable Chinese phrase {phrase}")
            self.assertTrue("适配器" in text or "adapter" in text.lower(), f"{doc} is missing adapter terminology")

    def test_setup_json_reports_adapter_runtime_version_mismatch(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            defaults = temp_root / "config" / "defaults"
            defaults.mkdir(parents=True)
            for config_file in (ROOT / "config" / "defaults").glob("*.json"):
                (defaults / config_file.name).write_text(config_file.read_text(encoding="utf-8"), encoding="utf-8")
            for directory in ["apps/openclaw", "apps/hermes-agent", "apps/hermes-web-ui", "data/logs", "data/tmp", "portal"]:
                (temp_root / directory).mkdir(parents=True, exist_ok=True)
            node_source = shutil.which("node")
            self.assertIsNotNone(node_source)
            node_target = temp_root / "runtimes" / "windows" / "node" / "node.exe"
            node_target.parent.mkdir(parents=True)
            shutil.copyfile(node_source, node_target)

            result = run_dispatcher_for_root(temp_root, "setup", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            requirements = {
                item["serviceId"]: item
                for item in payload["adapterRuntimeRequirements"]
                if item["versionRequirement"]
            }
            hermes_web = requirements["hermes-web-ui"]
            self.assertEqual(hermes_web["runtime"], "node")
            self.assertEqual(hermes_web["versionRequirement"], ">=23.0.0")
            self.assertFalse(hermes_web["satisfies"])
            self.assertIn("22.", hermes_web["version"])
            action_ids = {action["id"] for action in payload["actions"]}
            self.assertIn("runtime-version:hermes-web-ui:node", action_ids)
        finally:
            temp_dir.cleanup()

    def test_setup_text_prints_recommended_actions(self):
        result = run_dispatcher("setup")

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Recommended actions:", result.stdout)
        self.assertIn("Review runtime preparation plan", result.stdout)

    def test_setup_json_reports_default_port_diagnostics(self):
        result = run_dispatcher("setup", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        ports = {port["name"]: port for port in payload["ports"]}

        self.assertEqual(ports["portal"]["port"], 17000)
        self.assertTrue(ports["portal"]["available"])
        self.assertEqual(ports["hermesAgent"]["port"], 8642)
        self.assertEqual(ports["hermesWebUi"]["port"], 8648)
        self.assertTrue(all(port["host"] == "127.0.0.1" for port in ports.values()))

    def test_setup_json_reports_occupied_port(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 17000))
            listener.listen(1)

            result = run_dispatcher("setup", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        portal = next(port for port in payload["ports"] if port["name"] == "portal")
        self.assertFalse(portal["available"])
        self.assertIn("Port 17000 is already in use", "\n".join(payload["messages"]))

    def test_setup_json_reports_required_paths(self):
        result = run_dispatcher("setup", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        paths = {item["path"]: item for item in payload["paths"]}

        for required in [
            "adapters",
            "apps/openclaw",
            "apps/hermes-agent",
            "apps/hermes-web-ui",
            "config/defaults/ports.json",
            "config/defaults/services.json",
            "config/defaults/runtimes.json",
            "data/logs",
            "data/tmp",
            "portal",
        ]:
            self.assertIn(required, paths)
            self.assertTrue(paths[required]["exists"], required)
            self.assertTrue(paths[required]["required"], required)

        self.assertEqual(paths["config/defaults/ports.json"]["type"], "file")
        self.assertEqual(paths["data/logs"]["type"], "directory")

    def test_setup_json_reports_env_template_diagnostics(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            result = run_dispatcher_for_root(temp_root, "setup", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            env_files = {item["path"]: item for item in payload["envFiles"]}

            for env_file in [
                "config/env/hermes.env",
                "config/env/hermes-web-ui.env",
                "config/env/openclaw.env",
            ]:
                self.assertIn(env_file, env_files)
                self.assertFalse(env_files[env_file]["exists"])
                self.assertTrue(env_files[env_file]["exampleExists"])
                self.assertTrue(env_files[env_file]["examplePath"].endswith(".env.example"))

            messages = "\n".join(payload["messages"])
            self.assertIn("Env file missing: config/env/hermes.env", messages)
            self.assertIn("copy config/env/hermes.env.example", messages)
        finally:
            temp_dir.cleanup()

    def test_init_env_json_creates_missing_env_files_without_overwriting_existing_values(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            existing = temp_root / "config" / "env" / "hermes.env"
            existing.write_text("SECRET_TOKEN=keep-me\n", encoding="utf-8")

            result = run_dispatcher_for_root(temp_root, "init-env", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["dryRun"])
            self.assertEqual(
                payload["created"],
                ["config/env/hermes-web-ui.env", "config/env/openclaw.env"],
            )
            skipped = {item["path"]: item for item in payload["skipped"]}
            self.assertEqual(skipped["config/env/hermes.env"]["reason"], "exists")
            self.assertEqual(existing.read_text(encoding="utf-8"), "SECRET_TOKEN=keep-me\n")

            for env_file in payload["created"]:
                target = temp_root / env_file
                example = temp_root / f"{env_file}.example"
                self.assertTrue(target.exists(), env_file)
                self.assertEqual(target.read_text(encoding="utf-8"), example.read_text(encoding="utf-8"))
        finally:
            temp_dir.cleanup()

    def test_init_env_dry_run_reports_missing_env_files_without_writing(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            result = run_dispatcher_for_root(temp_root, "init-env", "--dry-run", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertEqual(
                payload["created"],
                [
                    "config/env/hermes.env",
                    "config/env/hermes-web-ui.env",
                    "config/env/openclaw.env",
                ],
            )

            for env_file in payload["created"]:
                self.assertFalse((temp_root / env_file).exists(), env_file)
        finally:
            temp_dir.cleanup()

    def test_service_env_json_reports_loaded_variables_without_secret_values(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            env_file = temp_root / "config" / "env" / "hermes.env"
            env_file.write_text(
                "\n".join(
                    [
                        "# local secret values must not be printed",
                        "HERMES_API_KEY=secret-value",
                        "QUOTED_VALUE=\"hello world\"",
                        "export EXPORTED_VALUE=from-export",
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            result = run_dispatcher_for_root(temp_root, "service-env", "hermes-agent", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("secret-value", result.stdout)
            self.assertNotIn("hello world", result.stdout)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["serviceId"], "hermes-agent")

            files = {item["path"]: item for item in payload["files"]}
            hermes_env = files["config/env/hermes.env"]
            self.assertTrue(hermes_env["exists"])
            self.assertTrue(hermes_env["loaded"])
            self.assertEqual(
                hermes_env["variables"],
                ["EXPORTED_VALUE", "HERMES_API_KEY", "QUOTED_VALUE"],
            )
            self.assertEqual(hermes_env["errors"], [])

            for variable in [
                "USB_ROOT",
                "HOME",
                "USERPROFILE",
                "HERMES_HOME",
                "HERMES_API_KEY",
                "QUOTED_VALUE",
                "EXPORTED_VALUE",
            ]:
                self.assertIn(variable, payload["variables"])
        finally:
            temp_dir.cleanup()

    def test_default_gateway_tokens_are_unified_without_service_env_value_leakage(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            init = run_dispatcher_for_root(temp_root, "init-env", "-Json")
            self.assertEqual(init.returncode, 0, init.stderr)

            for service_id in ("openclaw", "hermes-agent", "hermes-web-ui"):
                diagnostic = run_dispatcher_for_root(temp_root, "service-env", service_id, "-Json")
                self.assertEqual(diagnostic.returncode, 0, diagnostic.stderr)
                self.assertNotIn("clawhermes", diagnostic.stdout)

            script = (
                "const { resolveServiceEnvironment } = require('./core/node/dist/core.js');"
                "const root = process.argv[1];"
                "const serviceIds = ['openclaw', 'hermes-agent', 'hermes-web-ui'];"
                "const result = Object.fromEntries(serviceIds.map((id) => [id, resolveServiceEnvironment(root, id).env]));"
                "process.stdout.write(JSON.stringify({"
                "openclaw: result.openclaw.OPENCLAW_GATEWAY_TOKEN ?? null,"
                "'hermes-agent': result['hermes-agent'].API_SERVER_KEY ?? null,"
                "'hermes-web-ui-auth': result['hermes-web-ui'].AUTH_TOKEN ?? null,"
                "'hermes-web-ui-upstream': result['hermes-web-ui'].UPSTREAM ?? null,"
                "'hermes-web-ui-agent-base': result['hermes-web-ui'].HERMES_AGENT_API_BASE ?? null"
                "}));"
            )
            resolved = subprocess.run(
                ["node", "-e", script, str(temp_root)],
                cwd=ROOT,
                text=True,
                capture_output=True,
                check=False,
                env={**os.environ, "PYTHONUTF8": "1"},
            )

            self.assertEqual(resolved.returncode, 0, resolved.stderr)
            payload = json.loads(resolved.stdout)
            self.assertEqual(payload["openclaw"], "clawhermes")
            self.assertEqual(payload["hermes-agent"], "clawhermes")
            self.assertEqual(payload["hermes-web-ui-auth"], "clawhermes")
            self.assertEqual(payload["hermes-web-ui-upstream"], "http://127.0.0.1:8642")
            self.assertEqual(payload["hermes-web-ui-agent-base"], "http://127.0.0.1:8642")
        finally:
            temp_dir.cleanup()

    def test_service_env_unknown_service_fails_with_actionable_message(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            result = run_dispatcher_for_root(temp_root, "service-env", "missing-service", "-Json")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Unknown service: missing-service", result.stderr)
        finally:
            temp_dir.cleanup()

    def test_setup_json_reports_adapter_integration_readiness(self):
        result = run_dispatcher("setup", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        readiness = {item["id"]: item for item in payload["readiness"]}

        self.assertEqual(readiness["openclaw"]["status"], "verified")
        self.assertTrue(readiness["openclaw"]["productionReady"])
        self.assertIn("OpenClaw", readiness["openclaw"]["summary"])

        self.assertEqual(readiness["hermes-agent"]["status"], "verified")
        self.assertTrue(readiness["hermes-agent"]["productionReady"])
        self.assertIn("Hermes", readiness["hermes-agent"]["summary"])

        self.assertEqual(readiness["hermes-web-ui"]["status"], "verified")
        self.assertTrue(readiness["hermes-web-ui"]["productionReady"])
        self.assertIn("portable Node 24.15.0", readiness["hermes-web-ui"]["summary"])

        messages = "\n".join(payload["messages"])
        self.assertNotIn("Adapter openclaw integration is not production-ready", messages)
        self.assertNotIn("Adapter hermes-agent integration is not production-ready", messages)
        self.assertNotIn("Adapter hermes-web-ui integration is not production-ready", messages)

    def test_adapters_json_reports_preparation_plan(self):
        result = run_dispatcher("adapters", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        adapters = {adapter["id"]: adapter for adapter in payload["adapters"]}

        self.assertEqual(set(adapters), {"openclaw", "hermes-agent", "hermes-web-ui"})
        self.assertTrue(adapters["openclaw"]["appDirExists"])
        self.assertTrue(adapters["openclaw"]["integration"]["productionReady"])
        self.assertTrue(adapters["hermes-web-ui"]["integration"]["productionReady"])
        self.assertIn("config/env/openclaw.env", [item["path"] for item in adapters["openclaw"]["envFiles"]])
        self.assertEqual(adapters["openclaw"]["commands"]["start"], "node openclaw.mjs gateway --port ${OPENCLAW_GATEWAY_PORT} --verbose --allow-unconfigured")

    def test_adapters_json_can_filter_one_adapter(self):
        result = run_dispatcher("adapters", "hermes-web-ui", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual([adapter["id"] for adapter in payload["adapters"]], ["hermes-web-ui"])
        adapter = payload["adapters"][0]
        self.assertEqual(adapter["commands"]["setup"], "npm install")
        self.assertEqual(adapter["commands"]["start"], "node dist/server/index.js")
        self.assertEqual(adapter["dependsOn"], ["hermes-agent"])
        self.assertTrue(any("setup command" in step for step in adapter["nextSteps"]))

    def test_adapters_json_reports_upstream_source_metadata(self):
        result = run_dispatcher("adapters", "hermes-web-ui", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        adapter = json.loads(result.stdout)["adapters"][0]

        self.assertTrue(adapter["appDirReady"])
        self.assertEqual(adapter["upstream"]["name"], "EKKOLearnAI/hermes-web-ui")
        self.assertEqual(adapter["upstream"]["repositoryUrl"], "https://github.com/EKKOLearnAI/hermes-web-ui")
        self.assertEqual(adapter["upstream"]["installMode"], "source-checkout")
        self.assertTrue(any("Run the adapter setup command" in step for step in adapter["nextSteps"]))

    def test_adapters_json_reports_runtime_version_requirement(self):
        result = run_dispatcher("adapters", "hermes-web-ui", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        adapter = json.loads(result.stdout)["adapters"][0]
        self.assertEqual(adapter["runtime"]["kind"], "node")
        self.assertEqual(adapter["runtime"]["versionRequirement"], ">=23.0.0")

    def test_adapters_json_reports_hermes_agent_wsl2_strategy(self):
        result = run_dispatcher("adapters", "hermes-agent", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        adapter = json.loads(result.stdout)["adapters"][0]
        self.assertEqual(adapter["runtime"]["kind"], "wsl2")
        self.assertEqual(adapter["runtime"]["requiredExecutable"], "wsl.exe")
        self.assertEqual(adapter["runtime"]["distro"], "ClawHermes-Ubuntu")
        self.assertEqual(adapter["runtime"]["sourceDistro"], "Ubuntu")
        self.assertEqual(adapter["integration"]["platform"], "wsl2")
        self.assertEqual(adapter["integration"]["strategy"], "wsl2-adapter")

    def test_adapters_json_reports_openclaw_wsl2_strategy(self):
        result = run_dispatcher("adapters", "openclaw", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        adapter = json.loads(result.stdout)["adapters"][0]
        self.assertEqual(adapter["runtime"]["kind"], "wsl2")
        self.assertEqual(adapter["runtime"]["requiredExecutable"], "wsl.exe")
        self.assertEqual(adapter["runtime"]["distro"], "ClawHermes-Ubuntu")
        self.assertEqual(adapter["runtime"]["sourceDistro"], "Ubuntu")
        self.assertEqual(adapter["integration"]["platform"], "wsl2")
        self.assertEqual(adapter["integration"]["strategy"], "wsl2-adapter")
        self.assertTrue(adapter["integration"]["productionReady"])

    def test_adapters_unknown_service_fails_with_actionable_message(self):
        result = run_dispatcher("adapters", "missing-service", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown adapter: missing-service", result.stderr)

    def test_sources_json_reports_checkout_targets_without_mutation(self):
        result = run_dispatcher("sources", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        sources = {source["id"]: source for source in payload["sources"]}

        self.assertFalse(payload["wouldModify"])
        self.assertEqual(set(sources), {"openclaw", "hermes-agent", "hermes-web-ui"})
        self.assertTrue(sources["hermes-web-ui"]["appDirReady"])
        self.assertEqual(sources["hermes-web-ui"]["upstream"]["repositoryUrl"], "https://github.com/EKKOLearnAI/hermes-web-ui")
        self.assertIn("git clone", sources["hermes-web-ui"]["checkoutCommand"])

    def test_sources_json_can_filter_one_adapter(self):
        result = run_dispatcher("sources", "hermes-web-ui", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual([source["id"] for source in payload["sources"]], ["hermes-web-ui"])
        source = payload["sources"][0]
        self.assertTrue(source["targetPath"].endswith(str(Path("apps") / "hermes-web-ui")))
        self.assertIn("--branch main", source["checkoutCommand"])

    def test_sources_unknown_service_fails_with_actionable_message(self):
        result = run_dispatcher("sources", "missing-service", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown adapter: missing-service", result.stderr)

    def test_probe_sources_json_reports_reachable_upstream_ref_without_mutation(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            source_repo = create_local_source_repo(temp_root)
            rewrite_adapter_upstream(temp_root, "hermes-web-ui", source_repo)

            result = run_dispatcher_for_root(temp_root, "probe-sources", "hermes-web-ui", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["wouldModify"])
            self.assertEqual([source["id"] for source in payload["sources"]], ["hermes-web-ui"])
            source = payload["sources"][0]
            self.assertTrue(source["reachable"])
            self.assertTrue(source["refFound"])
            self.assertEqual(source["checkoutRef"], "main")
            self.assertFalse((temp_root / "apps" / "hermes-web-ui" / ".git").exists())
        finally:
            temp_dir.cleanup()

    def test_probe_sources_json_reports_missing_ref(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            source_repo = create_local_source_repo(temp_root)
            rewrite_adapter_upstream(temp_root, "hermes-web-ui", source_repo)
            adapter_path = temp_root / "adapters" / "hermes-web-ui" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["upstream"]["checkoutRef"] = "missing-branch"
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")

            result = run_dispatcher_for_root(temp_root, "probe-sources", "hermes-web-ui", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            source = json.loads(result.stdout)["sources"][0]
            self.assertTrue(source["reachable"])
            self.assertFalse(source["refFound"])
            self.assertIn("not found", source["message"])
        finally:
            temp_dir.cleanup()

    def test_probe_sources_unknown_service_fails_with_actionable_message(self):
        result = run_dispatcher("probe-sources", "missing-service", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown adapter: missing-service", result.stderr)

    def test_checkout_source_requires_explicit_confirmation(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            source_repo = create_local_source_repo(temp_root)
            rewrite_adapter_upstream(temp_root, "hermes-web-ui", source_repo)
            target = temp_root / "apps" / "hermes-web-ui"
            target.mkdir(parents=True)
            (target / ".gitkeep").write_text("\n", encoding="utf-8")

            result = run_dispatcher_for_root(temp_root, "checkout-source", "hermes-web-ui", "-Json")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("--confirm-checkout", result.stderr)
            self.assertTrue((target / ".gitkeep").exists())
            self.assertFalse((target / ".git").exists())
        finally:
            temp_dir.cleanup()

    def test_checkout_source_dry_run_does_not_modify_app_dir(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            source_repo = create_local_source_repo(temp_root)
            rewrite_adapter_upstream(temp_root, "hermes-web-ui", source_repo)
            target = temp_root / "apps" / "hermes-web-ui"
            target.mkdir(parents=True)
            (target / ".gitkeep").write_text("\n", encoding="utf-8")

            result = run_dispatcher_for_root(temp_root, "checkout-source", "hermes-web-ui", "--dry-run", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["wouldModify"])
            self.assertFalse(payload["cloned"])
            self.assertTrue((target / ".gitkeep").exists())
            self.assertFalse((target / ".git").exists())
        finally:
            temp_dir.cleanup()

    def test_checkout_source_confirm_clones_placeholder_app_dir(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            source_repo = create_local_source_repo(temp_root)
            rewrite_adapter_upstream(temp_root, "hermes-web-ui", source_repo)
            target = temp_root / "apps" / "hermes-web-ui"
            target.mkdir(parents=True)
            (target / ".gitkeep").write_text("\n", encoding="utf-8")

            result = run_dispatcher_for_root(temp_root, "checkout-source", "hermes-web-ui", "--confirm-checkout", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["dryRun"])
            self.assertTrue(payload["wouldModify"])
            self.assertTrue(payload["cloned"])
            self.assertTrue((target / ".git").exists())
            self.assertTrue((target / "README.md").exists())
            self.assertFalse((target / ".gitkeep").exists())
        finally:
            temp_dir.cleanup()

    def test_setup_adapter_requires_explicit_confirmation(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)
            marker = temp_root / "data" / "tmp" / "fake-setup.json"

            result = run_dispatcher_for_root(temp_root, "setup-adapter", "fake-service", "-Json")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("--confirm-setup", result.stderr)
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_setup_adapter_dry_run_reports_command_without_running(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)
            marker = temp_root / "data" / "tmp" / "fake-setup.json"

            result = run_dispatcher_for_root(temp_root, "setup-adapter", "fake-service", "--dry-run", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["wouldModify"])
            self.assertFalse(payload["executed"])
            self.assertEqual(payload["command"], "node setup.js")
            self.assertIn("FAKE_SECRET", payload["environment"]["variables"])
            self.assertNotIn("from-env-file", result.stdout)
            self.assertFalse(marker.exists())
        finally:
            temp_dir.cleanup()

    def test_setup_adapter_confirm_runs_adapter_setup_command(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)
            marker = temp_root / "data" / "tmp" / "fake-setup.json"

            result = run_dispatcher_for_root(temp_root, "setup-adapter", "fake-service", "--confirm-setup", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["dryRun"])
            self.assertTrue(payload["wouldModify"])
            self.assertTrue(payload["executed"])
            self.assertEqual(payload["exitCode"], 0)
            marker_payload = json.loads(marker.read_text(encoding="utf-8"))
            self.assertEqual(marker_payload["fakeSecret"], "from-env-file")
            self.assertTrue(marker_payload["cwd"].endswith(str(Path("apps") / "fake-service")))
        finally:
            temp_dir.cleanup()

    def test_setup_adapter_wsl2_dry_run_reports_wsl_command_without_running(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            missing_wsl = str(temp_root / "missing-wsl.exe")

            result = run_dispatcher_for_root(temp_root, "setup-adapter", "hermes-agent", "--dry-run", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["wouldModify"])
            self.assertFalse(payload["executed"])
            self.assertEqual(payload["runner"], "wsl2")
            self.assertIn("mktemp", payload["command"])
            self.assertIn("setup-hermes.sh", payload["command"])
            self.assertIn("printf 'n\\nn\\n'", payload["command"])
            self.assertIn("--cd", payload["wsl"]["args"])
            self.assertIn("--distribution", payload["wsl"]["args"])
            self.assertIn("ClawHermes-Ubuntu", payload["wsl"]["args"])
            self.assertTrue(payload["wsl"]["workingDirectory"].startswith("/mnt/"))
            self.assertIn("bash", payload["wsl"]["args"])
            self.assertIn("HERMES_HOME=", payload["wsl"]["script"])
            self.assertIn("./setup-hermes.sh", payload["wsl"]["script"])
        finally:
            temp_dir.cleanup()

    def test_setup_adapter_wsl2_confirm_requires_healthy_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            missing_wsl = str(temp_root / "missing-wsl.exe")

            result = run_dispatcher_for_root(temp_root, "setup-adapter", "hermes-agent", "--confirm-setup", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("WSL2 is not ready", result.stderr)
        finally:
            temp_dir.cleanup()

    def test_setup_adapter_wsl2_confirm_runs_fake_wsl_and_writes_setup_log(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            marker = temp_root / "data" / "tmp" / "fake-wsl-setup.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-setup-args.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, stay_running=False, marker_path=marker, args_path=args_file, list_distribution="ClawHermes-Ubuntu")
            env = {
                "CLAWHERMES_WSL_EXE": str(fake_wsl),
            }

            result = run_dispatcher_for_root(temp_root, "setup-adapter", "hermes-agent", "--confirm-setup", "-Json", env=env)

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["runner"], "wsl2")
            self.assertTrue(payload["executed"])
            self.assertEqual(payload["exitCode"], 0)
            wait_for_file(marker)
            self.assertIn("--distribution", payload["wsl"]["args"])
            self.assertIn("ClawHermes-Ubuntu", payload["wsl"]["args"])
            self.assertIn("./setup-hermes.sh", payload["wsl"]["script"])
            log_text = Path(payload["logFile"]).read_text(encoding="utf-8")
            self.assertIn("exitCode: 0", log_text)
            self.assertIn("fake wsl completed", log_text)
        finally:
            temp_dir.cleanup()

    def test_verify_adapter_reports_missing_setup_output(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)

            result = run_dispatcher_for_root(temp_root, "verify-adapter", "fake-service", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            checks = {check["id"]: check for check in payload["checks"]}
            self.assertFalse(payload["productionReadyCandidate"])
            self.assertEqual(checks["app-dir-ready"]["status"], "pass")
            self.assertEqual(checks["setup-output"]["status"], "fail")
            self.assertEqual(checks["start-command"]["status"], "pass")
            self.assertNotIn("from-env-file", result.stdout)
        finally:
            temp_dir.cleanup()

    def test_verify_adapter_passes_after_confirmed_setup_for_process_adapter(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)
            setup = run_dispatcher_for_root(temp_root, "setup-adapter", "fake-service", "--confirm-setup", "-Json")
            self.assertEqual(setup.returncode, 0, setup.stderr)

            result = run_dispatcher_for_root(temp_root, "verify-adapter", "fake-service", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            checks = {check["id"]: check for check in payload["checks"]}
            self.assertTrue(payload["productionReadyCandidate"])
            self.assertEqual(checks["setup-output"]["status"], "pass")
            self.assertEqual(checks["health-behavior"]["status"], "pass")
        finally:
            temp_dir.cleanup()

    def test_verify_adapter_reports_wsl2_gate_when_host_is_missing(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            adapter_path = temp_root / "adapters" / "hermes-agent" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["health"]["timeoutSeconds"] = 1
            adapter["health"]["url"] = f"http://127.0.0.1:{free_tcp_port()}/health"
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
            (temp_root / "config" / "env" / "hermes.env").write_text("HERMES_HOME=data/hermes\n", encoding="utf-8")
            setup_log = temp_root / "data" / "logs" / "setup-hermes-agent.log"
            setup_log.parent.mkdir(parents=True, exist_ok=True)
            setup_log.write_text("exitCode: 0\n", encoding="utf-8")

            missing_wsl = str(temp_root / "missing-wsl.exe")
            result = run_dispatcher_for_root(temp_root, "verify-adapter", "hermes-agent", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            checks = {check["id"]: check for check in payload["checks"]}
            self.assertFalse(payload["productionReadyCandidate"])
            self.assertEqual(checks["wsl-executable"]["status"], "fail")
            self.assertEqual(checks["wsl-target-distro"]["status"], "fail")
            self.assertIn("wsl.exe not found", checks["wsl-executable"]["message"])
            self.assertFalse(payload["wsl"]["found"])
        finally:
            temp_dir.cleanup()

    def test_verify_adapter_passes_wsl2_gate_when_target_distro_is_ready(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            adapter_path = temp_root / "adapters" / "hermes-agent" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["health"]["timeoutSeconds"] = 1
            adapter["health"]["url"] = f"http://127.0.0.1:{free_tcp_port()}/health"
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
            (temp_root / "config" / "env" / "hermes.env").write_text("HERMES_HOME=data/hermes\n", encoding="utf-8")
            setup_log = temp_root / "data" / "logs" / "setup-hermes-agent.log"
            setup_log.parent.mkdir(parents=True, exist_ok=True)
            setup_log.write_text("exitCode: 0\n", encoding="utf-8")
            fake_wsl = make_fake_wsl_cmd(temp_root, stay_running=False, list_distribution="ClawHermes-Ubuntu")

            result = run_dispatcher_for_root(temp_root, "verify-adapter", "hermes-agent", "-Json", env={"CLAWHERMES_WSL_EXE": str(fake_wsl)})

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            checks = {check["id"]: check for check in payload["checks"]}
            self.assertEqual(checks["wsl-executable"]["status"], "pass")
            self.assertEqual(checks["wsl-target-distro"]["status"], "pass")
            self.assertEqual(payload["wsl"]["desiredDistro"], "ClawHermes-Ubuntu")
            self.assertEqual(payload["wsl"]["desiredDistroVersion"], 2)
            self.assertFalse(payload["productionReadyCandidate"])
            self.assertEqual(checks["health-behavior"]["status"], "fail")
        finally:
            temp_dir.cleanup()

    def test_verify_adapter_unknown_service_fails_with_actionable_message(self):
        result = run_dispatcher("verify-adapter", "missing-service", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown adapter: missing-service", result.stderr)

    def test_mark_adapter_ready_requires_explicit_confirmation(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)
            setup = run_dispatcher_for_root(temp_root, "setup-adapter", "fake-service", "--confirm-setup", "-Json")
            self.assertEqual(setup.returncode, 0, setup.stderr)

            result = run_dispatcher_for_root(temp_root, "mark-adapter-ready", "fake-service", "--summary", "Verified in test", "-Json")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("--confirm-ready", result.stderr)
            adapter = json.loads((temp_root / "adapters" / "fake-service" / "adapter.json").read_text(encoding="utf-8"))
            self.assertFalse(adapter["integration"]["productionReady"])
        finally:
            temp_dir.cleanup()

    def test_mark_adapter_ready_rejects_failed_verification(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)

            result = run_dispatcher_for_root(temp_root, "mark-adapter-ready", "fake-service", "--confirm-ready", "--summary", "Verified in test", "-Json")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("not a production-ready candidate", result.stderr)
            adapter = json.loads((temp_root / "adapters" / "fake-service" / "adapter.json").read_text(encoding="utf-8"))
            self.assertFalse(adapter["integration"]["productionReady"])
        finally:
            temp_dir.cleanup()

    def test_mark_adapter_ready_updates_integration_metadata_after_verification(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            configure_fake_setup_command(temp_root)
            setup = run_dispatcher_for_root(temp_root, "setup-adapter", "fake-service", "--confirm-setup", "-Json")
            self.assertEqual(setup.returncode, 0, setup.stderr)

            result = run_dispatcher_for_root(temp_root, "mark-adapter-ready", "fake-service", "--confirm-ready", "--summary", "Verified in test", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["updated"])
            self.assertTrue(payload["verification"]["productionReadyCandidate"])
            adapter = json.loads((temp_root / "adapters" / "fake-service" / "adapter.json").read_text(encoding="utf-8"))
            self.assertEqual(adapter["integration"]["status"], "verified")
            self.assertTrue(adapter["integration"]["productionReady"])
            self.assertEqual(adapter["integration"]["summary"], "Verified in test")
            self.assertRegex(adapter["integration"]["verifiedAt"], r"^\d{4}-\d{2}-\d{2}$")
        finally:
            temp_dir.cleanup()

    def test_runtimes_json_outputs_preparation_steps_from_manifest(self):
        result = run_dispatcher("runtimes", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)

        self.assertEqual(payload["platform"], "windows")
        steps = {step["name"]: step for step in payload["steps"]}
        self.assertEqual(set(steps), {"node", "python", "git"})
        self.assertEqual(steps["node"]["action"], "extract")
        self.assertIn("https://nodejs.org/en/download", steps["node"]["sourceUrl"])
        self.assertTrue(steps["node"]["installDir"].endswith(str(Path("runtimes") / "windows" / "node")))
        self.assertTrue(any(path.endswith("node.exe") for path in steps["node"]["expectedExecutables"]))
        self.assertEqual("official-windows-embeddable", steps["python"]["packageType"])
        self.assertIn("thumbdrive", steps["git"]["notes"])
        self.assertTrue(any(message.startswith("Download Portable Node.js") for message in payload["messages"]))
        requirements = {
            item["serviceId"]: item
            for item in payload["adapterRuntimeRequirements"]
            if item["versionRequirement"]
        }
        self.assertEqual(requirements["hermes-web-ui"]["runtime"], "node")
        self.assertEqual(requirements["hermes-web-ui"]["versionRequirement"], ">=23.0.0")
        self.assertIn("requires node >=23.0.0", requirements["hermes-web-ui"]["message"])

    def test_payloads_json_reports_ignored_payload_inventory(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            rootfs = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            rootfs.parent.mkdir(parents=True, exist_ok=True)
            rootfs.write_bytes(b"tiny-rootfs")
            digest = hashlib.sha256(rootfs.read_bytes()).hexdigest()
            (temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar.sha256").write_text(
                f"{digest}  ubuntu-rootfs.tar\n",
                encoding="utf-8",
            )
            backup = temp_root / "data" / "backups" / "wsl" / "ClawHermes-Ubuntu-2026-05-01T00-00-00-000Z.tar"
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(b"tiny-backup")

            result = run_dispatcher_for_root(temp_root, "payloads", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            apps = {item["serviceId"]: item for item in payload["apps"]}
            rootfs_items = {item["distro"]: item for item in payload["wslRootfs"]}
            backups = {item["distro"]: item for item in payload["wslBackups"]}

            self.assertFalse(payload["wouldModify"])
            self.assertTrue(Path(payload["root"]).samefile(temp_root))
            self.assertIn("openclaw", apps)
            self.assertTrue(apps["openclaw"]["exists"])
            self.assertFalse(apps["openclaw"]["ready"])
            self.assertTrue(rootfs_items["Ubuntu"]["archive"]["exists"])
            self.assertEqual(rootfs_items["Ubuntu"]["archive"]["sizeBytes"], len(b"tiny-rootfs"))
            self.assertEqual(rootfs_items["Ubuntu"]["archive"]["sha256Sidecar"]["value"], digest)
            self.assertIsNotNone(backups["Ubuntu"]["latest"])
            self.assertEqual(backups["Ubuntu"]["latest"]["sizeBytes"], len(b"tiny-backup"))
            self.assertTrue(payload["policy"]["noAutomaticDownload"])
        finally:
            temp_dir.cleanup()

    def test_payload_export_dry_run_reports_manifest_entries_without_archive(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            app_file = temp_root / "apps" / "openclaw" / "README.md"
            app_file.write_text("# tiny openclaw\n", encoding="utf-8")
            rootfs = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            rootfs.parent.mkdir(parents=True, exist_ok=True)
            rootfs.write_bytes(b"tiny-rootfs")
            backup = temp_root / "data" / "backups" / "wsl" / "ClawHermes-Ubuntu-2026-05-01T00-00-00-000Z.tar"
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(b"tiny-backup")

            result = run_dispatcher_for_root(temp_root, "payload-export", "--dry-run", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            entry_paths = {entry["path"] for entry in payload["entries"]}
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["created"])
            self.assertFalse(Path(payload["archivePath"]).exists())
            self.assertIn("apps/openclaw", entry_paths)
            self.assertIn("runtimes/wsl/ubuntu-rootfs.tar", entry_paths)
            self.assertIn("data/backups/wsl/ClawHermes-Ubuntu-2026-05-01T00-00-00-000Z.tar", entry_paths)
            self.assertFalse(any(path.startswith("data/tmp") for path in entry_paths))
        finally:
            temp_dir.cleanup()

    def test_payload_export_confirm_creates_manifest_archive(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            app_file = temp_root / "apps" / "openclaw" / "README.md"
            app_file.write_text("# tiny openclaw\n", encoding="utf-8")
            rootfs = temp_root / "runtimes" / "wsl" / "ubuntu-rootfs.tar"
            rootfs.parent.mkdir(parents=True, exist_ok=True)
            rootfs.write_bytes(b"tiny-rootfs")
            backup = temp_root / "data" / "backups" / "wsl" / "ClawHermes-Ubuntu-2026-05-01T00-00-00-000Z.tar"
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_bytes(b"tiny-backup")

            result = run_dispatcher_for_root(temp_root, "payload-export", "--confirm-export", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            archive_path = Path(payload["archivePath"])
            self.assertTrue(payload["created"])
            self.assertTrue(archive_path.exists())
            self.assertTrue(archive_path.parent.samefile(temp_root / "data" / "backups" / "payloads"))
            with zipfile.ZipFile(archive_path) as archive:
                names = set(archive.namelist())
                manifest = json.loads(archive.read("payload-manifest.json").decode("utf-8"))
            self.assertIn("payload-manifest.json", names)
            self.assertIn("apps/openclaw/README.md", names)
            self.assertIn("runtimes/wsl/ubuntu-rootfs.tar", names)
            self.assertIn("data/backups/wsl/ClawHermes-Ubuntu-2026-05-01T00-00-00-000Z.tar", names)
            self.assertFalse(any(name.startswith("data/tmp/") for name in names))
            self.assertEqual({entry["path"] for entry in manifest["entries"]}, {entry["path"] for entry in payload["entries"]})
        finally:
            temp_dir.cleanup()

    def test_install_runtime_dry_run_reports_archive_plan(self):
        temp_dir = tempfile.TemporaryDirectory()
        temp_root = Path(temp_dir.name)
        try:
            defaults_dir = temp_root / "config" / "defaults"
            defaults_dir.mkdir(parents=True)
            (defaults_dir / "runtimes.json").write_text(
                (ROOT / "config" / "defaults" / "runtimes.json").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            archive = temp_root / "data" / "tmp" / "node-runtime-test.zip"
            archive.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("node-v22.0.0-win-x64/node.exe", "")

            result = run_dispatcher_for_root(temp_root, "install-runtime", "node", "--archive", str(archive), "--dry-run", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["runtime"], "node")
            self.assertTrue(payload["dryRun"])
            self.assertEqual(payload["archive"], str(archive))
            self.assertTrue(payload["installDir"].endswith(str(Path("runtimes") / "windows" / "node")))
            self.assertTrue(payload["wouldExtract"])
            self.assertFalse(payload["installed"])
            self.assertTrue(any(path.endswith("node.exe") for path in payload["expectedExecutables"]))
        finally:
            temp_dir.cleanup()

    def test_install_runtime_extracts_local_archive_and_setup_detects_it(self):
        archive = ROOT / "data" / "tmp" / "node-runtime-test.zip"
        install_dir = ROOT / "runtimes" / "windows" / "node"
        try:
            self._remove_runtime_test_files(install_dir)
            archive.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(archive, "w") as package:
                package.writestr("node-v22.0.0-win-x64/node.exe", "")
                package.writestr("node-v22.0.0-win-x64/npm.cmd", "")

            result = run_dispatcher("install-runtime", "node", "--archive", str(archive), "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["installed"])
            self.assertTrue((install_dir / "node.exe").exists())

            setup = run_dispatcher("setup", "-Json")
            self.assertEqual(setup.returncode, 0, setup.stderr)
            setup_payload = json.loads(setup.stdout)
            node_runtime = next(runtime for runtime in setup_payload["runtimes"] if runtime["name"] == "node")
            self.assertTrue(node_runtime["found"])
        finally:
            self._remove_runtime_test_files(install_dir)

    def test_install_runtime_can_verify_explicit_sha256(self):
        archive = ROOT / "data" / "tmp" / "node-runtime-test.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive, "w") as package:
            package.writestr("node-v22.0.0-win-x64/node.exe", "")
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()

        result = run_dispatcher("install-runtime", "node", "--archive", str(archive), "--sha256", digest, "--dry-run", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["sha256"], digest)
        self.assertTrue(payload["checksumVerified"])

    def test_install_runtime_rejects_wrong_sha256(self):
        archive = ROOT / "data" / "tmp" / "node-runtime-test.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive, "w") as package:
            package.writestr("node-v22.0.0-win-x64/node.exe", "")

        result = run_dispatcher("install-runtime", "node", "--archive", str(archive), "--sha256", "0" * 64, "--dry-run", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("SHA256 mismatch", result.stderr)

    def _remove_runtime_test_files(self, install_dir):
        for filename in ("node.exe", "npm.cmd"):
            path = install_dir / filename
            if path.exists():
                path.unlink()

    def test_start_status_stop_manage_placeholder_pid_metadata(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")

            self.assertEqual(start.returncode, 0, start.stderr)
            start_payload = json.loads(start.stdout)
            self.assertEqual(start_payload["started"], ["openclaw", "hermes-agent", "hermes-web-ui"])

            pid_dir = temp_root / "data" / "tmp" / "pids"
            for service_id in start_payload["started"]:
                pid_file = pid_dir / f"{service_id}.pid"
                self.assertTrue(pid_file.exists(), f"{pid_file} was not created")
                metadata = json.loads(pid_file.read_text(encoding="utf-8"))
                self.assertEqual(metadata["serviceId"], service_id)
                self.assertEqual(metadata["status"], "placeholder-started")
                self.assertTrue(Path(metadata["logFile"]).is_absolute())
                self.assertIn("environment", metadata)
                self.assertIn("variables", metadata["environment"])
                self.assertIn("files", metadata["environment"])
                self.assertIn("USB_ROOT", metadata["environment"]["variables"])
                self.assertNotIn(str(temp_root), json.dumps(metadata["environment"]))

            launcher_log = temp_root / "data" / "logs" / "launcher.log"
            self.assertTrue(launcher_log.exists())
            self.assertIn("Started placeholder service", launcher_log.read_text(encoding="utf-8"))

            status = run_dispatcher_for_root(temp_root, "status", "-Json")
            self.assertEqual(status.returncode, 0, status.stderr)
            status_payload = json.loads(status.stdout)
            services = {service["id"]: service for service in status_payload["services"]}
            self.assertEqual(services["openclaw"]["status"], "placeholder-started")
            self.assertEqual(services["hermes-agent"]["status"], "placeholder-started")
            self.assertEqual(services["hermes-web-ui"]["status"], "placeholder-started")
            self.assertTrue(services["openclaw"]["placeholder"])
            self.assertIsNone(services["openclaw"]["processId"])
            self.assertFalse(services["openclaw"]["health"]["ready"])
            self.assertEqual(services["openclaw"]["health"]["type"], "http")

            snapshot_path = temp_root / "data" / "tmp" / "status.json"
            self.assertTrue(snapshot_path.exists())
            snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
            self.assertTrue(Path(snapshot["root"]).samefile(temp_root))
            self.assertIn("generatedAt", snapshot)
            snapshot_services = {service["id"]: service for service in snapshot["services"]}
            self.assertEqual(snapshot_services["openclaw"]["health"]["type"], "http")

            stop = run_dispatcher_for_root(temp_root, "stop", "-Json")
            self.assertEqual(stop.returncode, 0, stop.stderr)
            stop_payload = json.loads(stop.stdout)
            self.assertEqual(
                stop_payload["stopped"],
                ["portal", "hermes-web-ui", "hermes-agent", "openclaw"],
            )

            for service_id in start_payload["started"]:
                self.assertFalse((pid_dir / f"{service_id}.pid").exists())
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_start_runs_production_ready_adapter_process_and_stop_kills_it(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")

            self.assertEqual(start.returncode, 0, start.stderr)
            start_payload = json.loads(start.stdout)
            self.assertEqual(start_payload["started"], ["fake-service"])

            pid_file = temp_root / "data" / "tmp" / "pids" / "fake-service.pid"
            self.assertTrue(pid_file.exists())
            metadata = json.loads(pid_file.read_text(encoding="utf-8"))
            self.assertEqual(metadata["status"], "running")
            self.assertFalse(metadata["placeholder"])
            self.assertIsInstance(metadata["processId"], int)
            self.assertIn("FAKE_SECRET", metadata["environment"]["variables"])
            self.assertNotIn("from-env-file", json.dumps(metadata))

            env_output = temp_root / "data" / "tmp" / "fake-service-env.json"
            wait_for_file(env_output)
            child_env = json.loads(env_output.read_text(encoding="utf-8"))
            self.assertEqual(child_env["FAKE_SECRET"], "from-env-file")
            self.assertEqual(Path(child_env["FAKE_INLINE"]).resolve(), (temp_root / "data" / "fake-service").resolve())
            self.assertEqual(Path(child_env["USB_ROOT"]).resolve(), temp_root.resolve())

            status = run_dispatcher_for_root(temp_root, "status", "-Json")
            self.assertEqual(status.returncode, 0, status.stderr)
            services = {service["id"]: service for service in json.loads(status.stdout)["services"]}
            self.assertEqual(services["fake-service"]["status"], "running")
            self.assertEqual(services["fake-service"]["processId"], metadata["processId"])
            self.assertFalse(services["fake-service"]["placeholder"])
            self.assertTrue(services["fake-service"]["health"]["ready"])
            self.assertEqual(services["fake-service"]["health"]["type"], "process")

            stop = run_dispatcher_for_root(temp_root, "stop", "-Json")
            self.assertEqual(stop.returncode, 0, stop.stderr)
            self.assertEqual(json.loads(stop.stdout)["stopped"], ["portal", "fake-service"])
            self.assertFalse(pid_file.exists())
            self.assertFalse(process_exists(metadata["processId"]))
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_start_uses_placeholder_when_production_ready_app_dir_has_no_real_content(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            defaults = temp_root / "config" / "defaults"
            defaults.mkdir(parents=True)
            for config_file in (ROOT / "config" / "defaults").glob("*.json"):
                (defaults / config_file.name).write_text(config_file.read_text(encoding="utf-8"), encoding="utf-8")
            services = json.loads((defaults / "services.json").read_text(encoding="utf-8"))
            services["startOrder"] = ["hermes-web-ui"]
            services["stopOrder"] = ["hermes-web-ui"]
            (defaults / "services.json").write_text(json.dumps(services, indent=2), encoding="utf-8")
            app_dir = temp_root / "apps" / "hermes-web-ui"
            app_dir.mkdir(parents=True)
            (app_dir / ".gitkeep").write_text("\n", encoding="utf-8")
            copy_portal_dist(temp_root)
            mark_adapter_production_ready(temp_root, "hermes-web-ui")

            result = run_dispatcher_for_root(temp_root, "start", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            metadata = json.loads((temp_root / "data" / "tmp" / "pids" / "hermes-web-ui.pid").read_text(encoding="utf-8"))
            self.assertTrue(metadata["placeholder"])
            self.assertEqual(metadata["status"], "placeholder-started")
            self.assertNotIn("processId", metadata)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_start_uses_hermes_web_ui_production_server_without_touching_upstream(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            defaults = temp_root / "config" / "defaults"
            services = json.loads((defaults / "services.json").read_text(encoding="utf-8"))
            services["startOrder"] = ["hermes-web-ui"]
            services["stopOrder"] = ["hermes-web-ui"]
            (defaults / "services.json").write_text(json.dumps(services, indent=2), encoding="utf-8")

            adapter_path = temp_root / "adapters" / "hermes-web-ui" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["health"] = {"type": "process", "timeoutSeconds": 5}
            adapter["integration"]["productionReady"] = True
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")

            app_dir = temp_root / "apps" / "hermes-web-ui"
            stale_upstream_config = "\n".join(
                [
                    "import { defineConfig } from 'vite'",
                    "",
                    "const BACKEND = 'http://127.0.0.1:8648'",
                    "",
                    "export default defineConfig({ server: { proxy: { '/api': { target: BACKEND } } } })",
                    "",
                ]
            )
            (app_dir / "vite.config.ts").write_text(
                stale_upstream_config,
                encoding="utf-8",
            )
            (app_dir / "package.json").write_text(
                json.dumps({"name": "hermes-web-ui-test", "version": "0.0.0"}, indent=2),
                encoding="utf-8",
            )
            server_entry = app_dir / "dist" / "server" / "index.js"
            server_entry.parent.mkdir(parents=True)
            server_entry.write_text(
                "\n".join(
                    [
                        "const http = require('node:http');",
                        "const fs = require('node:fs');",
                        "const path = require('node:path');",
                        "const root = process.env.USB_ROOT;",
                        "fs.writeFileSync(path.join(root, 'data', 'tmp', 'hermes-web-ui-server-env.json'), JSON.stringify({",
                        "  argv: process.argv.slice(2),",
                        "  port: process.env.PORT,",
                        "  upstream: process.env.UPSTREAM,",
                        "  hermesAgentApiBase: process.env.HERMES_AGENT_API_BASE,",
                        "  hermesBin: process.env.HERMES_BIN,",
                        "  path: process.env.PATH",
                        "}, null, 2));",
                        "http.createServer((req, res) => { res.writeHead(200); res.end('ok'); }).listen(Number(process.env.PORT || 8648), '127.0.0.1');",
                        "",
                    ]
                ),
                encoding="utf-8",
            )
            (temp_root / "config" / "env" / "hermes-web-ui.env").write_text(
                "HERMES_AGENT_API_BASE=http://127.0.0.1:8642\nUPSTREAM=http://127.0.0.1:8642\n",
                encoding="utf-8",
            )
            stale_profile_dir = temp_root / "data" / "home" / ".hermes"
            stale_profile_dir.mkdir(parents=True)
            (stale_profile_dir / "config.yaml").write_text(
                "\n".join(
                    [
                        "platforms:",
                        "  api_server:",
                        "    enabled: true",
                        "    key: ''",
                        "    cors_origins: '*'",
                        "    extra:",
                        "      port: 65534",
                        "      host: 127.0.0.1",
                        "",
                    ]
                ),
                encoding="utf-8",
            )

            start = run_dispatcher_for_root(temp_root, "start", "-Json")

            self.assertEqual(start.returncode, 0, start.stderr)
            hermes_config = temp_root / "data" / "hermes" / "config.yaml"
            self.assertTrue(hermes_config.exists())
            self.assertEqual(hermes_config.read_text(encoding="utf-8"), "{}\n")
            web_ui_profile_dir = temp_root / "data" / "home" / ".hermes"
            web_ui_config = web_ui_profile_dir / "config.yaml"
            web_ui_env = web_ui_profile_dir / ".env"
            self.assertTrue(web_ui_config.exists())
            web_ui_config_text = web_ui_config.read_text(encoding="utf-8")
            self.assertIn("api_server:", web_ui_config_text)
            self.assertTrue(web_ui_env.exists())
            self.assertIn("API_SERVER_KEY=clawhermes", web_ui_env.read_text(encoding="utf-8"))
            vite_config = (app_dir / "vite.config.ts").read_text(encoding="utf-8")
            self.assertEqual(vite_config, stale_upstream_config)
            generated_config = temp_root / "data" / "tmp" / "hermes-web-ui" / "vite.config.mjs"
            self.assertFalse(generated_config.exists())
            wait_for_file(temp_root / "data" / "tmp" / "hermes-web-ui-server-env.json")
            launched = json.loads((temp_root / "data" / "tmp" / "hermes-web-ui-server-env.json").read_text(encoding="utf-8"))
            ports = json.loads((temp_root / "data" / "tmp" / "ports.json").read_text(encoding="utf-8"))
            hermes_agent_port = next(item for item in ports["services"] if item["serviceId"] == "hermes-agent")["assignedPort"]
            hermes_web_ui_port = next(item for item in ports["services"] if item["serviceId"] == "hermes-web-ui")["assignedPort"]
            expected_upstream = f"http://127.0.0.1:{hermes_agent_port}"
            self.assertIn(f"      port: {hermes_agent_port}", web_ui_config_text)
            self.assertIn("      host: 127.0.0.1", web_ui_config_text)
            self.assertEqual(launched["argv"], [])
            self.assertEqual(launched["port"], str(hermes_web_ui_port))
            self.assertEqual(launched["upstream"], expected_upstream)
            self.assertEqual(launched["hermesAgentApiBase"], expected_upstream)
            self.assertTrue(launched["hermesBin"].lower().endswith("powershell.exe"))
            shim_dir = temp_root / "data" / "tmp" / "bin" / "hermes-web-ui"
            self.assertTrue((shim_dir / "profile.ps1").exists())
            self.assertTrue((shim_dir / "logs.ps1").exists())
            self.assertIn(str(shim_dir), launched["path"])
            metadata = json.loads((temp_root / "data" / "tmp" / "pids" / "hermes-web-ui.pid").read_text(encoding="utf-8"))
            self.assertNotIn("runner", metadata)
            self.assertIn("dist/server/index.js", metadata["command"].replace("\\", "/"))
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_start_adapter_requires_explicit_confirmation(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            mark_fake_service_candidate(temp_root)

            result = run_dispatcher_for_root(temp_root, "start-adapter", "fake-service", "-Json")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("--confirm-start", result.stderr)
            self.assertFalse((temp_root / "data" / "tmp" / "pids" / "fake-service.pid").exists())
        finally:
            temp_dir.cleanup()

    def test_start_adapter_dry_run_reports_command_without_running(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            mark_fake_service_candidate(temp_root)

            result = run_dispatcher_for_root(temp_root, "start-adapter", "fake-service", "--dry-run", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["wouldModify"])
            self.assertFalse(payload["started"])
            self.assertEqual(payload["command"], "node service.js")
            self.assertFalse((temp_root / "data" / "tmp" / "pids" / "fake-service.pid").exists())
        finally:
            temp_dir.cleanup()

    def test_start_adapter_confirm_launches_candidate_managed_process(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            mark_fake_service_candidate(temp_root)

            result = run_dispatcher_for_root(temp_root, "start-adapter", "fake-service", "--confirm-start", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertFalse(payload["dryRun"])
            self.assertTrue(payload["wouldModify"])
            self.assertTrue(payload["started"])
            self.assertFalse(payload["metadata"]["placeholder"])
            self.assertTrue((temp_root / "data" / "tmp" / "pids" / "fake-service.pid").exists())
            wait_for_file(temp_root / "data" / "tmp" / "fake-service-env.json")
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_start_adapter_wsl2_dry_run_reports_wsl_command_without_running(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            missing_wsl = str(temp_root / "missing-wsl.exe")

            result = run_dispatcher_for_root(temp_root, "start-adapter", "hermes-agent", "--dry-run", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["dryRun"])
            self.assertFalse(payload["wouldModify"])
            self.assertFalse(payload["started"])
            self.assertEqual(payload["runner"], "wsl2")
            self.assertEqual(payload["command"], "./venv/bin/hermes gateway run")
            self.assertIn("--cd", payload["wsl"]["args"])
            self.assertIn("--distribution", payload["wsl"]["args"])
            self.assertIn("ClawHermes-Ubuntu", payload["wsl"]["args"])
            self.assertTrue(payload["wsl"]["workingDirectory"].startswith("/mnt/"))
            self.assertIn("./venv/bin/hermes gateway run", payload["wsl"]["script"])
        finally:
            temp_dir.cleanup()

    def test_start_adapter_wsl2_confirm_requires_healthy_wsl(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            missing_wsl = str(temp_root / "missing-wsl.exe")

            result = run_dispatcher_for_root(temp_root, "start-adapter", "hermes-agent", "--confirm-start", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("WSL2 is not ready", result.stderr)
        finally:
            temp_dir.cleanup()

    def test_start_adapter_wsl2_confirm_launches_managed_wsl_process_and_stop_kills_it(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            marker = temp_root / "data" / "tmp" / "fake-wsl-started.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-args.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, marker_path=marker, args_path=args_file, list_distribution="ClawHermes-Ubuntu")
            env = {
                "CLAWHERMES_WSL_EXE": str(fake_wsl),
            }

            result = run_dispatcher_for_root(temp_root, "start-adapter", "hermes-agent", "--confirm-start", "-Json", env=env)

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["runner"], "wsl2")
            self.assertTrue(payload["started"])
            metadata = payload["metadata"]
            self.assertEqual(metadata["status"], "running")
            self.assertFalse(metadata["placeholder"])
            self.assertEqual(metadata["runner"], "wsl2")
            expected_wsl_root = f"/mnt/{temp_root.drive[0].lower()}/{str(temp_root)[3:].replace(chr(92), '/')}"
            self.assertEqual(metadata["wsl"]["workingDirectory"].replace("\\", "/"), expected_wsl_root + "/apps/hermes-agent")
            self.assertIsInstance(metadata["processId"], int)
            self.assertTrue(process_exists(metadata["processId"]))
            wait_for_file(marker)
            wait_for_file(args_file)
            launched_args = args_file.read_text(encoding="utf-8")
            self.assertIn("--distribution ClawHermes-Ubuntu", launched_args)
            self.assertIn("./venv/bin/hermes gateway run", launched_args)

            pid_file = temp_root / "data" / "tmp" / "pids" / "hermes-agent.pid"
            self.assertTrue(pid_file.exists())
            pid_metadata = json.loads(pid_file.read_text(encoding="utf-8"))
            self.assertEqual(pid_metadata["runner"], "wsl2")
            self.assertEqual(pid_metadata["processId"], metadata["processId"])

            status = run_dispatcher_for_root(temp_root, "status", "-Json", env=env)
            self.assertEqual(status.returncode, 0, status.stderr)
            services = {service["id"]: service for service in json.loads(status.stdout)["services"]}
            self.assertEqual(services["hermes-agent"]["status"], "running")
            self.assertEqual(services["hermes-agent"]["processId"], metadata["processId"])

            stop = run_dispatcher_for_root(temp_root, "stop", "-Json", env=env)
            self.assertEqual(stop.returncode, 0, stop.stderr)
            self.assertIn("hermes-agent", json.loads(stop.stdout)["stopped"])
            self.assertFalse(pid_file.exists())
            self.assertFalse(process_exists(metadata["processId"]))
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json", env={"CLAWHERMES_WSL_EXE": str(temp_root / "fake-wsl.cmd")})
            time.sleep(0.5)
            temp_dir.cleanup()

    def test_stop_runs_wsl2_adapter_stop_hook_before_killing_managed_process(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            adapter_path = temp_root / "adapters" / "hermes-agent" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["commands"]["stop"] = "echo WSL_STOP_HOOK"
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
            marker = temp_root / "data" / "tmp" / "fake-wsl-started.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-args.txt"
            stop_marker = temp_root / "data" / "tmp" / "fake-wsl-stopped.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, marker_path=marker, args_path=args_file, stop_marker_path=stop_marker, list_distribution="ClawHermes-Ubuntu")
            env = {"CLAWHERMES_WSL_EXE": str(fake_wsl)}
            start = run_dispatcher_for_root(temp_root, "start-adapter", "hermes-agent", "--confirm-start", "-Json", env=env)
            self.assertEqual(start.returncode, 0, start.stderr)
            process_id = json.loads(start.stdout)["metadata"]["processId"]
            self.assertTrue(process_exists(process_id))

            stop = run_dispatcher_for_root(temp_root, "stop", "-Json", env=env)

            self.assertEqual(stop.returncode, 0, stop.stderr)
            self.assertIn("hermes-agent", json.loads(stop.stdout)["stopped"])
            self.assertTrue(stop_marker.exists())
            self.assertFalse((temp_root / "data" / "tmp" / "pids" / "hermes-agent.pid").exists())
            self.assertFalse(process_exists(process_id))
            wait_for_process_exit(process_id)
            log_text = (temp_root / "data" / "logs" / "hermes-agent.log").read_text(encoding="utf-8")
            self.assertIn("WSL2 stop hook", log_text)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json", env={"CLAWHERMES_WSL_EXE": str(temp_root / "fake-wsl.cmd")})
            time.sleep(0.5)
            temp_dir.cleanup()

    def test_stop_runs_wsl2_adapter_stop_hook_when_pid_file_is_missing(self):
        temp_dir, temp_root = make_temp_usb_root()
        try:
            make_hermes_agent_app_ready(temp_root)
            adapter_path = temp_root / "adapters" / "hermes-agent" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["commands"]["stop"] = "echo WSL_STOP_HOOK"
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
            defaults = temp_root / "config" / "defaults"
            defaults.mkdir(parents=True, exist_ok=True)
            for config_file in (ROOT / "config" / "defaults").glob("*.json"):
                (defaults / config_file.name).write_text(config_file.read_text(encoding="utf-8"), encoding="utf-8")
            services = json.loads((defaults / "services.json").read_text(encoding="utf-8"))
            services["stopOrder"] = ["hermes-agent"]
            (defaults / "services.json").write_text(json.dumps(services, indent=2), encoding="utf-8")
            stop_marker = temp_root / "data" / "tmp" / "fake-wsl-stopped.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, stay_running=False, stop_marker_path=stop_marker, list_distribution="ClawHermes-Ubuntu")

            stop = run_dispatcher_for_root(temp_root, "stop", "-Json", env={"CLAWHERMES_WSL_EXE": str(fake_wsl)})

            self.assertEqual(stop.returncode, 0, stop.stderr)
            self.assertIn("hermes-agent", json.loads(stop.stdout)["stopped"])
            self.assertTrue(stop_marker.exists())
            log_text = (temp_root / "data" / "logs" / "hermes-agent.log").read_text(encoding="utf-8")
            self.assertIn("WSL2 stop hook", log_text)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json", env={"CLAWHERMES_WSL_EXE": str(temp_root / "fake-wsl.cmd")})
            temp_dir.cleanup()

    def test_start_uses_wsl2_plan_for_production_ready_wsl_adapter(self):
        temp_dir, temp_root = make_temp_usb_root()
        process_id = None
        try:
            defaults = temp_root / "config" / "defaults"
            defaults.mkdir(parents=True, exist_ok=True)
            for config_file in (ROOT / "config" / "defaults").glob("*.json"):
                (defaults / config_file.name).write_text(config_file.read_text(encoding="utf-8"), encoding="utf-8")
            services = json.loads((defaults / "services.json").read_text(encoding="utf-8"))
            services["startOrder"] = ["hermes-agent"]
            services["stopOrder"] = ["hermes-agent"]
            (defaults / "services.json").write_text(json.dumps(services, indent=2), encoding="utf-8")
            copy_portal_dist(temp_root)
            make_hermes_agent_app_ready(temp_root)
            mark_adapter_production_ready(temp_root, "hermes-agent")
            marker = temp_root / "data" / "tmp" / "fake-wsl-started.txt"
            args_file = temp_root / "data" / "tmp" / "fake-wsl-args.txt"
            fake_wsl = make_fake_wsl_cmd(temp_root, marker_path=marker, args_path=args_file, list_distribution="ClawHermes-Ubuntu")
            env = {
                "CLAWHERMES_WSL_EXE": str(fake_wsl),
            }

            start = run_dispatcher_for_root(temp_root, "start", "-Json", env=env)

            self.assertEqual(start.returncode, 0, start.stderr)
            self.assertIn("hermes-agent", json.loads(start.stdout)["started"])
            wait_for_file(marker)
            metadata = json.loads((temp_root / "data" / "tmp" / "pids" / "hermes-agent.pid").read_text(encoding="utf-8"))
            process_id = metadata["processId"]
            self.assertEqual(metadata["runner"], "wsl2")
            self.assertFalse(metadata["placeholder"])
            self.assertIn("--distribution", metadata["wsl"]["args"])
            self.assertTrue(process_exists(process_id))
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json", env={"CLAWHERMES_WSL_EXE": str(temp_root / "fake-wsl.cmd")})
            if process_id:
                wait_for_process_exit(process_id)
            temp_dir.cleanup()

    def test_start_openclaw_refreshes_gateway_token_in_runtime_config(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        process_id = None
        try:
            app_dir = temp_root / "apps" / "openclaw"
            (app_dir / "openclaw.mjs").write_text("console.log('openclaw test payload')\n", encoding="utf-8")
            config_path = temp_root / "data" / "openclaw" / "openclaw.json"
            config_path.write_text(
                json.dumps(
                    {
                        "gateway": {
                            "mode": "local",
                            "bind": "loopback",
                            "auth": {
                                "mode": "token",
                                "token": "old-generated-token",
                            },
                        },
                        "logging": {
                            "file": "/tmp/old-openclaw.log",
                        },
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            adapter_path = temp_root / "adapters" / "openclaw" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["health"] = {"type": "process", "timeoutSeconds": 5}
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
            fake_wsl = make_fake_wsl_cmd(
                temp_root,
                marker_path=temp_root / "data" / "tmp" / "fake-openclaw-wsl-started.txt",
                list_distribution="ClawHermes-Ubuntu",
            )

            start = run_dispatcher_for_root(
                temp_root,
                "start-adapter",
                "openclaw",
                "--confirm-start",
                "-Json",
                env={"CLAWHERMES_WSL_EXE": str(fake_wsl)},
            )

            self.assertEqual(start.returncode, 0, start.stderr)
            metadata = json.loads((temp_root / "data" / "tmp" / "pids" / "openclaw.pid").read_text(encoding="utf-8"))
            process_id = metadata["processId"]
            refreshed = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(refreshed["gateway"]["auth"]["mode"], "token")
            self.assertEqual(refreshed["gateway"]["auth"]["token"], "clawhermes")
            self.assertEqual(refreshed["gateway"]["mode"], "local")
            self.assertEqual(refreshed["gateway"]["bind"], "loopback")
            self.assertTrue(refreshed["logging"]["file"].endswith("data/logs/openclaw-runtime.log"))
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json", env={"CLAWHERMES_WSL_EXE": str(temp_root / "fake-wsl.cmd")})
            if process_id:
                wait_for_process_exit(process_id)
            temp_dir.cleanup()

    def test_status_removes_stale_managed_adapter_pid_file(self):
        temp_dir, temp_root = make_temp_process_usb_root()
        try:
            pid_dir = temp_root / "data" / "tmp" / "pids"
            pid_dir.mkdir(parents=True, exist_ok=True)
            pid_file = pid_dir / "fake-service.pid"
            pid_file.write_text(
                json.dumps(
                    {
                        "serviceId": "fake-service",
                        "displayName": "Fake Service",
                        "status": "running",
                        "processId": 99999999,
                        "placeholder": False,
                        "logFile": str(temp_root / "data" / "logs" / "fake-service.log"),
                    }
                ),
                encoding="utf-8",
            )

            status = run_dispatcher_for_root(temp_root, "status", "-Json")

            self.assertEqual(status.returncode, 0, status.stderr)
            status_payload = json.loads(status.stdout)
            statuses = {service["id"]: service["status"] for service in status_payload["services"]}
            self.assertEqual(statuses["fake-service"], "stopped")
            self.assertFalse(pid_file.exists())
        finally:
            temp_dir.cleanup()

    def test_logs_json_tails_known_service_log(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)

            result = run_dispatcher_for_root(temp_root, "logs", "openclaw", "--lines", "1", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["target"], "openclaw")
            self.assertTrue(payload["exists"])
            self.assertEqual(payload["requestedLines"], 1)
            self.assertTrue(payload["path"].endswith(str(Path("data") / "logs" / "openclaw.log")))
            self.assertEqual(len(payload["lines"]), 1)
            self.assertIn("Placeholder service started", payload["lines"][0])

            portal = run_dispatcher_for_root(temp_root, "logs", "portal", "--lines", "5", "-Json")
            self.assertEqual(portal.returncode, 0, portal.stderr)
            portal_payload = json.loads(portal.stdout)
            self.assertEqual(portal_payload["target"], "portal")
            self.assertTrue(portal_payload["exists"])
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_logs_unknown_target_fails_with_actionable_message(self):
        result = run_dispatcher("logs", "missing-service", "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown log target: missing-service", result.stderr)

    def test_backup_dry_run_reports_data_only_entries_without_archive(self):
        result = run_dispatcher("backup", "--dry-run", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        entries = {entry["path"] for entry in payload["entries"]}
        self.assertTrue(payload["dryRun"])
        self.assertEqual(payload["profile"], "data-only")
        self.assertIn("config", entries)
        self.assertIn("adapters", entries)
        self.assertIn(str(Path("data") / "openclaw"), entries)
        self.assertFalse(Path(payload["archivePath"]).exists())

    def test_backup_json_creates_data_only_archive(self):
        result = run_dispatcher("backup", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        archive_path = Path(payload["archivePath"])
        try:
            self.assertTrue(payload["created"])
            self.assertEqual(payload["profile"], "data-only")
            self.assertTrue(archive_path.exists())
            self.assertGreater(payload["sizeBytes"], 0)
            with zipfile.ZipFile(archive_path) as archive:
                names = set(archive.namelist())
            self.assertIn("backup-manifest.json", names)
            self.assertIn("config/defaults/ports.json", names)
            self.assertIn("adapters/openclaw/adapter.json", names)
            self.assertIn("data/openclaw/.gitkeep", names)
            self.assertFalse(any(name.startswith("data/cache/") for name in names))
            self.assertFalse(any(name.startswith("data/tmp/") for name in names))
            self.assertFalse(any(name.startswith("data/backups/") for name in names))
        finally:
            if archive_path.exists():
                archive_path.unlink()

    def test_restore_plan_reports_backup_manifest_without_extracting(self):
        backup = run_dispatcher("backup", "-Json")
        self.assertEqual(backup.returncode, 0, backup.stderr)
        archive_path = Path(json.loads(backup.stdout)["archivePath"])
        try:
            result = run_dispatcher("restore-plan", "--archive", str(archive_path), "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            planned_paths = {entry["path"] for entry in payload["entries"]}
            self.assertEqual(Path(payload["archivePath"]).resolve(), archive_path.resolve())
            self.assertEqual(Path(payload["root"]).resolve(), ROOT)
            self.assertFalse(payload["wouldModify"])
            self.assertEqual(payload["manifest"]["profile"], "data-only")
            self.assertIn("config", planned_paths)
            self.assertIn("adapters", planned_paths)
            self.assertIn("backup-manifest.json", payload["manifestPath"])
            self.assertIn("--confirm-restore", payload["confirmCommand"])
        finally:
            if archive_path.exists():
                archive_path.unlink()

    def test_restore_plan_rejects_missing_archive(self):
        missing_archive = ROOT / "data" / "backups" / "missing-restore-test.zip"

        result = run_dispatcher("restore-plan", "--archive", str(missing_archive), "-Json")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Backup archive not found", result.stderr)

    def test_restore_requires_explicit_confirm_restore(self):
        backup = run_dispatcher("backup", "-Json")
        self.assertEqual(backup.returncode, 0, backup.stderr)
        archive_path = Path(json.loads(backup.stdout)["archivePath"])
        try:
            temp_dir, temp_root = make_temp_usb_root()
            try:
                result = run_dispatcher_for_root(temp_root, "restore", "--archive", str(archive_path), "-Json")

                self.assertNotEqual(result.returncode, 0)
                self.assertIn("--confirm-restore", result.stderr)
            finally:
                temp_dir.cleanup()
        finally:
            if archive_path.exists():
                archive_path.unlink()

    def test_restore_confirm_extracts_backup_without_existing_targets(self):
        source_dir = tempfile.TemporaryDirectory()
        restore_dir = tempfile.TemporaryDirectory()
        try:
            source_root = Path(source_dir.name)
            restore_root = Path(restore_dir.name)
            (source_root / "config" / "defaults").mkdir(parents=True)
            (source_root / "adapters" / "demo").mkdir(parents=True)
            (source_root / "data" / "openclaw").mkdir(parents=True)
            (source_root / "config" / "defaults" / "ports.json").write_text('{"portal": 17000}\n', encoding="utf-8")
            (source_root / "adapters" / "demo" / "adapter.json").write_text('{"id": "demo"}\n', encoding="utf-8")
            (source_root / "data" / "openclaw" / "state.txt").write_text("portable state\n", encoding="utf-8")
            backup = run_dispatcher_for_root(source_root, "backup", "-Json")
            self.assertEqual(backup.returncode, 0, backup.stderr)
            archive_path = Path(json.loads(backup.stdout)["archivePath"])

            result = run_dispatcher_for_root(restore_root, "restore", "--archive", str(archive_path), "--confirm-restore", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertTrue(payload["executed"])
            self.assertTrue(payload["confirmedRestore"])
            self.assertEqual(Path(payload["root"]).resolve(), restore_root.resolve())
            self.assertTrue((restore_root / "config" / "defaults" / "ports.json").exists())
            self.assertTrue((restore_root / "adapters" / "demo" / "adapter.json").exists())
            self.assertEqual((restore_root / "data" / "openclaw" / "state.txt").read_text(encoding="utf-8"), "portable state\n")
            self.assertFalse((restore_root / "backup-manifest.json").exists())
            self.assertFalse((restore_root / "data" / "tmp" / "restores").exists())
        finally:
            source_dir.cleanup()
            restore_dir.cleanup()

    def test_restore_rejects_existing_targets_before_extracting(self):
        backup = run_dispatcher("backup", "-Json")
        self.assertEqual(backup.returncode, 0, backup.stderr)
        archive_path = Path(json.loads(backup.stdout)["archivePath"])
        temp_dir, temp_root = make_temp_usb_root()
        try:
            (temp_root / "config").mkdir(parents=True, exist_ok=True)

            result = run_dispatcher_for_root(temp_root, "restore", "--archive", str(archive_path), "--confirm-restore", "-Json")

            self.assertNotEqual(result.returncode, 0)
            self.assertIn("restore target already exists", result.stderr)
            self.assertFalse((temp_root / "data" / "tmp" / "restores").exists())
        finally:
            temp_dir.cleanup()
            if archive_path.exists():
                archive_path.unlink()

    def test_powershell_wrapper_allows_restore_plan(self):
        backup = run_dispatcher("backup", "-Json")
        self.assertEqual(backup.returncode, 0, backup.stderr)
        archive_path = Path(json.loads(backup.stdout)["archivePath"])
        try:
            result = run_powershell_dispatcher("restore-plan", "-Json", "--archive", str(archive_path))

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(Path(payload["archivePath"]).resolve(), archive_path.resolve())
            self.assertFalse(payload["wouldModify"])

            restore = run_powershell_dispatcher("restore", "-Json", "--archive", str(archive_path))
            self.assertNotEqual(restore.returncode, 0)
            self.assertIn("--confirm-restore", restore.stderr)
        finally:
            if archive_path.exists():
                archive_path.unlink()

    def test_status_reports_http_adapter_ready_when_endpoint_responds(self):
        temp_dir, temp_root, port = make_temp_http_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")

            self.assertEqual(start.returncode, 0, start.stderr)
            wait_for_url(f"http://127.0.0.1:{port}/health")

            status = run_dispatcher_for_root(temp_root, "status", "-Json")

            self.assertEqual(status.returncode, 0, status.stderr)
            services = {service["id"]: service for service in json.loads(status.stdout)["services"]}
            health = services["http-service"]["health"]
            self.assertEqual(services["http-service"]["status"], "running")
            self.assertEqual(health["type"], "http")
            self.assertTrue(health["ready"])
            self.assertEqual(health["url"], f"http://127.0.0.1:{port}/health")
            self.assertEqual(health["statusCode"], 200)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_status_reports_http_adapter_not_ready_when_endpoint_is_unreachable(self):
        temp_dir, temp_root, port = make_temp_http_usb_root(health_port=free_tcp_port())
        try:
            pid_dir = temp_root / "data" / "tmp" / "pids"
            pid_dir.mkdir(parents=True, exist_ok=True)
            pid_file = pid_dir / "http-service.pid"
            pid_file.write_text(
                json.dumps(
                    {
                        "serviceId": "http-service",
                        "displayName": "HTTP Service",
                        "status": "running",
                        "processId": os.getpid(),
                        "placeholder": False,
                        "logFile": str(temp_root / "data" / "logs" / "http-service.log"),
                    }
                ),
                encoding="utf-8",
            )

            status = run_dispatcher_for_root(temp_root, "status", "-Json")

            self.assertEqual(status.returncode, 0, status.stderr)
            services = {service["id"]: service for service in json.loads(status.stdout)["services"]}
            health = services["http-service"]["health"]
            self.assertEqual(services["http-service"]["status"], "running")
            self.assertEqual(health["type"], "http")
            self.assertFalse(health["ready"])
            self.assertEqual(health["url"], f"http://127.0.0.1:{port}/health")
            self.assertIsNone(health["statusCode"])
            self.assertIn("unreachable", health["reason"].lower())
        finally:
            temp_dir.cleanup()

    def test_status_http_health_probe_requests_utf8_powershell_output(self):
        temp_dir, temp_root, port = make_temp_http_usb_root(health_port=free_tcp_port())
        try:
            fake_powershell = temp_root / "powershell.cmd"
            fake_powershell.write_text(
                "\n".join(
                    [
                        "@echo off",
                        "echo %* | findstr /C:\"OutputEncoding\" > nul",
                        "if errorlevel 1 (",
                        "  echo {\"ok\":false,\"statusCode\":null,\"error\":\"\\ufffd\\ufffd\"}",
                        "  exit /b 0",
                        ")",
                        "echo {\"ok\":false,\"statusCode\":null,\"error\":\"readable-error\"}",
                        "exit /b 0",
                        "",
                    ]
                ),
                encoding="ascii",
            )
            pid_dir = temp_root / "data" / "tmp" / "pids"
            pid_dir.mkdir(parents=True, exist_ok=True)
            (pid_dir / "http-service.pid").write_text(
                json.dumps(
                    {
                        "serviceId": "http-service",
                        "displayName": "HTTP Service",
                        "status": "running",
                        "processId": os.getpid(),
                        "placeholder": False,
                        "logFile": str(temp_root / "data" / "logs" / "http-service.log"),
                    }
                ),
                encoding="utf-8",
            )

            status = run_dispatcher_for_root(
                temp_root,
                "status",
                "-Json",
                env={"CLAWHERMES_POWERSHELL_EXE": str(fake_powershell)},
            )

            self.assertEqual(status.returncode, 0, status.stderr)
            services = {service["id"]: service for service in json.loads(status.stdout)["services"]}
            reason = services["http-service"]["health"]["reason"]
            self.assertIn("readable-error", reason)
            self.assertNotIn("\ufffd", reason)
        finally:
            temp_dir.cleanup()

    def test_status_keeps_wsl2_http_service_running_when_wrapper_pid_exits_but_health_is_ready(self):
        temp_dir, temp_root, port = make_temp_http_usb_root()
        server = None
        try:
            adapter_path = temp_root / "adapters" / "http-service" / "adapter.json"
            adapter = json.loads(adapter_path.read_text(encoding="utf-8"))
            adapter["runtime"]["kind"] = "wsl2"
            adapter_path.write_text(json.dumps(adapter, indent=2), encoding="utf-8")
            server = subprocess.Popen(
                [
                    "node",
                    "-e",
                    (
                        "const http=require('node:http');"
                        f"const port={port};"
                        "http.createServer((req,res)=>{"
                        "if(req.url==='/health'){res.writeHead(200);res.end('ok');return;}"
                        "res.writeHead(404);res.end('missing');"
                        "}).listen(port,'127.0.0.1');"
                    ),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            wait_for_url(f"http://127.0.0.1:{port}/health")
            pid_dir = temp_root / "data" / "tmp" / "pids"
            pid_dir.mkdir(parents=True, exist_ok=True)
            pid_file = pid_dir / "http-service.pid"
            pid_file.write_text(
                json.dumps(
                    {
                        "serviceId": "http-service",
                        "displayName": "HTTP Service",
                        "status": "running",
                        "processId": 99999999,
                        "placeholder": False,
                        "runner": "wsl2",
                        "logFile": str(temp_root / "data" / "logs" / "http-service.log"),
                    }
                ),
                encoding="utf-8",
            )

            status = run_dispatcher_for_root(temp_root, "status", "-Json")

            self.assertEqual(status.returncode, 0, status.stderr)
            services = {service["id"]: service for service in json.loads(status.stdout)["services"]}
            service = services["http-service"]
            self.assertEqual(service["status"], "running")
            self.assertIsNone(service["processId"])
            self.assertTrue(service["health"]["ready"])
            self.assertTrue(pid_file.exists())
        finally:
            if server:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
            temp_dir.cleanup()

    def test_start_generates_portal_from_adapter_metadata(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")

            self.assertEqual(start.returncode, 0, start.stderr)
            portal_index = temp_root / "portal" / "index.html"
            self.assertTrue(portal_index.exists())

            html = portal_index.read_text(encoding="utf-8")
            self.assertIn("ClawHermes-USB Portal", html)
            self.assertIn(str(temp_root), html)
            self.assertIn(str(temp_root / "data"), html)
            self.assertIn("OpenClaw", html)
            self.assertIn("Hermes Agent", html)
            self.assertIn("Hermes Web UI", html)
            self.assertIn("data/logs/openclaw.log", html)
            self.assertIn("data/logs/hermes-agent.log", html)
            self.assertIn("data/logs/hermes-web-ui.log", html)
            self.assertIn("<th>Health</th>", html)
            self.assertIn("Not ready", html)
            self.assertIn("Placeholder metadata is present", html)
            self.assertIn('data-service-id="openclaw"', html)
            self.assertIn("data-status-cell", html)
            self.assertIn("data-health-label", html)
            self.assertIn("data-health-reason", html)
            self.assertIn("fetch('/status.json'", html)
            self.assertIn("WSL2 readiness", html)
            self.assertIn("data-wsl2-readiness", html)
            self.assertIn("wsl-workflow", html)
            self.assertIn("verify-adapter", html)
            self.assertIn("Adapter verification", html)
            self.assertIn("data-adapter-verification", html)
            self.assertIn("fetch('/adapter-verification.json'", html)
            self.assertIn("Logs", html)
            self.assertIn("data-log-viewer", html)
            self.assertIn("fetch('/logs.json'", html)
            self.assertIn("data-operation-actions", html)
            self.assertIn("fetch('/operations.json'", html)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_start_serves_portal_over_localhost_and_stop_shuts_it_down(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")

            self.assertEqual(start.returncode, 0, start.stderr)
            html = wait_for_portal()
            self.assertIn("ClawHermes-USB Portal", html)

            status = run_dispatcher_for_root(temp_root, "status", "-Json")
            self.assertEqual(status.returncode, 0, status.stderr)
            status_payload = json.loads(status.stdout)
            statuses = {service["id"]: service["status"] for service in status_payload["services"]}
            self.assertEqual(statuses["portal"], "running")

            portal_status = fetch_portal_status()
            self.assertIn("generatedAt", portal_status)
            portal_services = {service["id"]: service for service in portal_status["services"]}
            self.assertEqual(portal_services["portal"]["status"], "running")
            self.assertIn("health", portal_services["portal"])

            portal_pid = temp_root / "data" / "tmp" / "pids" / "portal.pid"
            self.assertTrue(portal_pid.exists())
            metadata = json.loads(portal_pid.read_text(encoding="utf-8"))
            self.assertEqual(metadata["serviceId"], "portal")
            self.assertEqual(metadata["url"], PORTAL_URL)

            stop = run_dispatcher_for_root(temp_root, "stop", "-Json")
            self.assertEqual(stop.returncode, 0, stop.stderr)
            self.assertFalse(portal_pid.exists())
            assert_portal_unreachable(self)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_portal_serves_setup_actions_snapshot(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            html = wait_for_portal()
            self.assertIn("Setup actions", html)
            self.assertIn("WSL2 readiness", html)

            setup_path = temp_root / "data" / "tmp" / "setup.json"
            self.assertTrue(setup_path.exists())
            setup_payload = fetch_portal_setup()
            action_ids = {action["id"] for action in setup_payload["actions"]}

            self.assertTrue(Path(setup_payload["root"]).samefile(temp_root))
            self.assertIn("runtime:node", action_ids)
            self.assertIn("env-file:hermes-agent", action_ids)
            self.assertTrue(any(item["serviceId"] == "openclaw" for item in setup_payload["wslArtifacts"]))
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_portal_serves_adapter_verification_snapshot(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            wait_for_portal()

            payload = fetch_portal_adapter_verification(timeout=5)
            adapters = {item["serviceId"]: item for item in payload["adapters"]}
            openclaw_checks = {item["id"] for item in adapters["openclaw"]["checks"]}

            self.assertTrue(Path(payload["root"]).samefile(temp_root))
            self.assertIn("generatedAt", payload)
            self.assertIn("openclaw", adapters)
            self.assertFalse(adapters["openclaw"]["productionReadyCandidate"])
            self.assertIn("wsl-executable", openclaw_checks)
            self.assertIn("wsl-target-distro", openclaw_checks)
            self.assertGreaterEqual(len(adapters["openclaw"]["nextSteps"]), 1)
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_portal_serves_log_snapshot(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            wait_for_portal()

            payload = fetch_portal_logs(timeout=5)
            logs = {item["target"]: item for item in payload["logs"]}

            self.assertTrue(Path(payload["root"]).samefile(temp_root))
            self.assertIn("generatedAt", payload)
            self.assertIn("launcher", logs)
            self.assertIn("portal", logs)
            self.assertIn("openclaw", logs)
            self.assertIn("setup-openclaw", logs)
            self.assertTrue(logs["launcher"]["exists"])
            self.assertLessEqual(len(logs["launcher"]["lines"]), logs["launcher"]["requestedLines"])
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_portal_serves_operation_actions(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            wait_for_portal()

            payload = fetch_portal_operations(timeout=5)
            actions = {item["id"]: item for item in payload["actions"]}

            self.assertTrue(Path(payload["root"]).samefile(temp_root))
            self.assertIn("status", actions)
            self.assertIn("backup", actions)
            self.assertIn("stop", actions)
            self.assertFalse(actions["status"]["mutatesState"])
            self.assertTrue(actions["backup"]["mutatesState"])
            self.assertTrue(actions["stop"]["mutatesState"])
            self.assertIn("launcher/windows/Backup.bat", actions["backup"]["batchCommand"])
            self.assertIn("launcher/windows/Stop.bat", actions["stop"]["batchCommand"])
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            temp_dir.cleanup()

    def test_portal_serves_backup_status(self):
        temp_dir, temp_root = make_temp_skeleton_usb_root()
        backup = run_dispatcher_for_root(temp_root, "backup", "-Json")
        self.assertEqual(backup.returncode, 0, backup.stderr)
        backup_payload = json.loads(backup.stdout)
        archive_path = Path(backup_payload["archivePath"])
        try:
            start = run_dispatcher_for_root(temp_root, "start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            wait_for_portal()

            backups = fetch_portal_backups()

            self.assertTrue(Path(backups["backupRoot"]).samefile(temp_root / "data" / "backups"))
            self.assertGreaterEqual(backups["count"], 1)
            self.assertEqual(backups["latest"]["fileName"], archive_path.name)
            self.assertEqual(Path(backups["latest"]["path"]).resolve(), archive_path.resolve())
        finally:
            run_dispatcher_for_root(temp_root, "stop", "-Json")
            if archive_path.exists():
                archive_path.unlink()
            temp_dir.cleanup()

    def test_status_removes_portal_pid_when_process_is_not_portal_server(self):
        pid_dir = ROOT / "data" / "tmp" / "pids"
        pid_dir.mkdir(parents=True, exist_ok=True)
        portal_pid = pid_dir / "portal.pid"
        portal_pid.write_text(
            json.dumps(
                {
                    "serviceId": "portal",
                    "displayName": "Portal",
                    "status": "running",
                    "processId": os.getpid(),
                    "url": PORTAL_URL,
                    "logFile": str(ROOT / "data" / "logs" / "portal.log"),
                }
            ),
            encoding="utf-8",
        )

        status = run_dispatcher("status", "-Json")

        self.assertEqual(status.returncode, 0, status.stderr)
        status_payload = json.loads(status.stdout)
        statuses = {service["id"]: service["status"] for service in status_payload["services"]}
        self.assertEqual(statuses["portal"], "stopped")
        self.assertFalse(portal_pid.exists())

    def test_start_remaps_portal_when_default_port_is_occupied_by_another_process(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 17000))
            listener.listen(1)

            temp_dir, temp_root = make_temp_skeleton_usb_root()
            try:
                start = run_dispatcher_for_root(temp_root, "start", "-Json")

                self.assertEqual(start.returncode, 0, start.stderr)
                payload = json.loads(start.stdout)
                self.assertNotEqual(payload["portal"]["url"], PORTAL_URL)
                self.assertRegex(payload["portal"]["url"], r"^http://127\.0\.0\.1:\d+/$")

                ports = json.loads((temp_root / "data" / "tmp" / "ports.json").read_text(encoding="utf-8"))
                self.assertEqual(ports["portal"]["defaultPort"], 17000)
                self.assertNotEqual(ports["portal"]["assignedPort"], 17000)
            finally:
                run_dispatcher_for_root(temp_root, "stop", "-Json")
                temp_dir.cleanup()

    def test_start_remaps_http_adapter_port_when_default_port_is_occupied(self):
        temp_dir, temp_root, port = make_temp_http_usb_root()
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", port))
            listener.listen(1)
            try:
                start = run_dispatcher_for_root(temp_root, "start", "-Json")

                self.assertEqual(start.returncode, 0, start.stderr)
                ports = json.loads((temp_root / "data" / "tmp" / "ports.json").read_text(encoding="utf-8"))
                service_port = next(item for item in ports["services"] if item["serviceId"] == "http-service")
                self.assertEqual(service_port["defaultPort"], port)
                self.assertNotEqual(service_port["assignedPort"], port)

                remapped_health = f"http://127.0.0.1:{service_port['assignedPort']}/health"
                wait_for_url(remapped_health)

                status = run_dispatcher_for_root(temp_root, "status", "-Json")
                self.assertEqual(status.returncode, 0, status.stderr)
                status_payload = json.loads(status.stdout)
                service = next(item for item in status_payload["services"] if item["id"] == "http-service")
                self.assertEqual(service["health"]["url"], remapped_health)
                self.assertTrue(service["health"]["ready"])
                self.assertEqual(service["portalUrl"], f"http://127.0.0.1:{service_port['assignedPort']}")
            finally:
                run_dispatcher_for_root(temp_root, "stop", "-Json")
                temp_dir.cleanup()


if __name__ == "__main__":
    unittest.main()
