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


def make_hermes_agent_app_ready(temp_root):
    app_dir = temp_root / "apps" / "hermes-agent"
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / "pyproject.toml").write_text("[project]\nname = \"hermes-agent-test\"\n", encoding="utf-8")


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
    (temp_root / "core" / "node" / "dist" / "portal-server.js").write_text(
        (ROOT / "core" / "node" / "dist" / "portal-server.js").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
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
    (temp_root / "core" / "node" / "dist" / "portal-server.js").write_text(
        (ROOT / "core" / "node" / "dist" / "portal-server.js").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
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

    def test_setup_json_reports_recommended_actions(self):
        result = run_dispatcher("setup", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        actions = payload["actions"]
        categories = {action["category"] for action in actions}
        action_ids = {action["id"] for action in actions}

        self.assertIn("runtime", categories)
        self.assertIn("adapter-integration", categories)
        self.assertIn("env-file", categories)
        self.assertIn("runtime:node", action_ids)
        self.assertIn("adapter-integration:openclaw", action_ids)
        self.assertNotIn("adapter-integration:hermes-web-ui", action_ids)
        self.assertIn("env-file:hermes-agent", action_ids)

        node_action = next(action for action in actions if action["id"] == "runtime:node")
        self.assertEqual(node_action["severity"], "warning")
        self.assertIn("runtimes", node_action["command"])

        env_action = next(action for action in actions if action["id"] == "env-file:hermes-agent")
        self.assertIn("init-env", env_action["command"])
        self.assertEqual(env_action["path"].replace("\\", "/"), "config/env/hermes.env")

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

    def test_setup_json_reports_wsl2_action_when_hermes_agent_needs_wsl2(self):
        missing_wsl = str(ROOT / "data" / "tmp" / "missing-wsl.exe")

        result = run_dispatcher("setup", "-Json", env={"CLAWHERMES_WSL_EXE": missing_wsl})

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertIn("wsl", payload)
        self.assertFalse(payload["wsl"]["found"])
        action_ids = {action["id"] for action in payload["actions"]}
        self.assertIn("wsl2:hermes-agent", action_ids)
        action = next(action for action in payload["actions"] if action["id"] == "wsl2:hermes-agent")
        self.assertEqual(action["category"], "wsl2")
        self.assertEqual(action["severity"], "warning")
        self.assertIn("Install or enable WSL2", action["title"])

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
        result = run_dispatcher("setup", "-Json")

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

        self.assertEqual(readiness["openclaw"]["status"], "blocked")
        self.assertFalse(readiness["openclaw"]["productionReady"])
        self.assertIn("WSL2", readiness["openclaw"]["summary"])

        self.assertEqual(readiness["hermes-agent"]["status"], "blocked")
        self.assertFalse(readiness["hermes-agent"]["productionReady"])
        self.assertIn("WSL2", readiness["hermes-agent"]["summary"])

        self.assertEqual(readiness["hermes-web-ui"]["status"], "verified")
        self.assertTrue(readiness["hermes-web-ui"]["productionReady"])
        self.assertIn("portable Node 24.15.0", readiness["hermes-web-ui"]["summary"])

        messages = "\n".join(payload["messages"])
        self.assertIn("Adapter openclaw integration is not production-ready", messages)
        self.assertIn("Adapter hermes-agent integration is not production-ready", messages)
        self.assertNotIn("Adapter hermes-web-ui integration is not production-ready", messages)

    def test_adapters_json_reports_preparation_plan(self):
        result = run_dispatcher("adapters", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        adapters = {adapter["id"]: adapter for adapter in payload["adapters"]}

        self.assertEqual(set(adapters), {"openclaw", "hermes-agent", "hermes-web-ui"})
        self.assertTrue(adapters["openclaw"]["appDirExists"])
        self.assertFalse(adapters["openclaw"]["integration"]["productionReady"])
        self.assertTrue(adapters["hermes-web-ui"]["integration"]["productionReady"])
        self.assertIn("config/env/openclaw.env", [item["path"] for item in adapters["openclaw"]["envFiles"]])
        self.assertTrue(any("init-env" in step for step in adapters["openclaw"]["nextSteps"]))

    def test_adapters_json_can_filter_one_adapter(self):
        result = run_dispatcher("adapters", "hermes-web-ui", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual([adapter["id"] for adapter in payload["adapters"]], ["hermes-web-ui"])
        adapter = payload["adapters"][0]
        self.assertEqual(adapter["commands"]["setup"], "npm install")
        self.assertEqual(adapter["commands"]["start"], "npm run start")
        self.assertEqual(adapter["dependsOn"], ["hermes-agent"])
        self.assertTrue(any("setup command" in step for step in adapter["nextSteps"]))

    def test_adapters_json_reports_upstream_source_metadata(self):
        result = run_dispatcher("adapters", "hermes-web-ui", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        adapter = json.loads(result.stdout)["adapters"][0]

        self.assertFalse(adapter["appDirReady"])
        self.assertEqual(adapter["upstream"]["name"], "EKKOLearnAI/hermes-web-ui")
        self.assertEqual(adapter["upstream"]["repositoryUrl"], "https://github.com/EKKOLearnAI/hermes-web-ui")
        self.assertEqual(adapter["upstream"]["installMode"], "source-checkout")
        self.assertTrue(any("Checkout upstream source" in step for step in adapter["nextSteps"]))

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
        self.assertEqual(adapter["integration"]["platform"], "wsl2")
        self.assertEqual(adapter["integration"]["strategy"], "wsl2-adapter")

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
        self.assertFalse(sources["hermes-web-ui"]["appDirReady"])
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
            self.assertEqual(payload["command"], "python -m pip install -e .")
            self.assertIn("--cd", payload["wsl"]["args"])
            self.assertTrue(payload["wsl"]["workingDirectory"].startswith("/mnt/"))
            self.assertIn("bash", payload["wsl"]["args"])
            self.assertIn("HERMES_HOME=", payload["wsl"]["script"])
            self.assertIn("python -m pip install -e .", payload["wsl"]["script"])
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
        start = run_dispatcher("start", "-Json")

        self.assertEqual(start.returncode, 0, start.stderr)
        start_payload = json.loads(start.stdout)
        self.assertEqual(start_payload["started"], ["openclaw", "hermes-agent", "hermes-web-ui"])

        pid_dir = ROOT / "data" / "tmp" / "pids"
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
            self.assertNotIn(str(ROOT), json.dumps(metadata["environment"]))

        launcher_log = ROOT / "data" / "logs" / "launcher.log"
        self.assertTrue(launcher_log.exists())
        self.assertIn("Started placeholder service", launcher_log.read_text(encoding="utf-8"))

        status = run_dispatcher("status", "-Json")
        self.assertEqual(status.returncode, 0, status.stderr)
        status_payload = json.loads(status.stdout)
        services = {service["id"]: service for service in status_payload["services"]}
        self.assertEqual(services["openclaw"]["status"], "placeholder-started")
        self.assertEqual(services["hermes-agent"]["status"], "placeholder-started")
        self.assertEqual(services["hermes-web-ui"]["status"], "placeholder-started")
        self.assertTrue(services["openclaw"]["placeholder"])
        self.assertIsNone(services["openclaw"]["processId"])
        self.assertFalse(services["openclaw"]["health"]["ready"])
        self.assertEqual(services["openclaw"]["health"]["type"], "process")

        snapshot_path = ROOT / "data" / "tmp" / "status.json"
        self.assertTrue(snapshot_path.exists())
        snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
        self.assertEqual(Path(snapshot["root"]).resolve(), ROOT)
        self.assertIn("generatedAt", snapshot)
        snapshot_services = {service["id"]: service for service in snapshot["services"]}
        self.assertEqual(snapshot_services["openclaw"]["health"]["type"], "process")

        stop = run_dispatcher("stop", "-Json")
        self.assertEqual(stop.returncode, 0, stop.stderr)
        stop_payload = json.loads(stop.stdout)
        self.assertEqual(
            stop_payload["stopped"],
            ["portal", "hermes-web-ui", "hermes-agent", "openclaw"],
        )

        for service_id in start_payload["started"]:
            self.assertFalse((pid_dir / f"{service_id}.pid").exists())

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
            portal_server = temp_root / "core" / "node" / "dist" / "portal-server.js"
            portal_server.parent.mkdir(parents=True)
            portal_server.write_text((ROOT / "core" / "node" / "dist" / "portal-server.js").read_text(encoding="utf-8"), encoding="utf-8")
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
            self.assertEqual(payload["command"], "hermes gateway run")
            self.assertIn("--cd", payload["wsl"]["args"])
            self.assertTrue(payload["wsl"]["workingDirectory"].startswith("/mnt/"))
            self.assertIn("hermes gateway run", payload["wsl"]["script"])
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
        try:
            start = run_dispatcher("start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)

            result = run_dispatcher("logs", "openclaw", "--lines", "1", "-Json")

            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["target"], "openclaw")
            self.assertTrue(payload["exists"])
            self.assertEqual(payload["requestedLines"], 1)
            self.assertTrue(payload["path"].endswith(str(Path("data") / "logs" / "openclaw.log")))
            self.assertEqual(len(payload["lines"]), 1)
            self.assertIn("Placeholder service started", payload["lines"][0])
        finally:
            run_dispatcher("stop", "-Json")

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

    def test_start_generates_portal_from_adapter_metadata(self):
        try:
            start = run_dispatcher("start", "-Json")

            self.assertEqual(start.returncode, 0, start.stderr)
            portal_index = ROOT / "portal" / "index.html"
            self.assertTrue(portal_index.exists())

            html = portal_index.read_text(encoding="utf-8")
            self.assertIn("ClawHermes-USB Portal", html)
            self.assertIn(str(ROOT), html)
            self.assertIn(str(ROOT / "data"), html)
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
        finally:
            run_dispatcher("stop", "-Json")

    def test_start_serves_portal_over_localhost_and_stop_shuts_it_down(self):
        start = run_dispatcher("start", "-Json")

        self.assertEqual(start.returncode, 0, start.stderr)
        html = wait_for_portal()
        self.assertIn("ClawHermes-USB Portal", html)

        status = run_dispatcher("status", "-Json")
        self.assertEqual(status.returncode, 0, status.stderr)
        status_payload = json.loads(status.stdout)
        statuses = {service["id"]: service["status"] for service in status_payload["services"]}
        self.assertEqual(statuses["portal"], "running")

        portal_status = fetch_portal_status()
        self.assertIn("generatedAt", portal_status)
        portal_services = {service["id"]: service for service in portal_status["services"]}
        self.assertEqual(portal_services["portal"]["status"], "running")
        self.assertIn("health", portal_services["portal"])

        portal_pid = ROOT / "data" / "tmp" / "pids" / "portal.pid"
        self.assertTrue(portal_pid.exists())
        metadata = json.loads(portal_pid.read_text(encoding="utf-8"))
        self.assertEqual(metadata["serviceId"], "portal")
        self.assertEqual(metadata["url"], PORTAL_URL)

        stop = run_dispatcher("stop", "-Json")
        self.assertEqual(stop.returncode, 0, stop.stderr)
        self.assertFalse(portal_pid.exists())
        assert_portal_unreachable(self)

    def test_portal_serves_setup_actions_snapshot(self):
        try:
            start = run_dispatcher("start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            html = wait_for_portal()
            self.assertIn("Setup actions", html)

            setup_path = ROOT / "data" / "tmp" / "setup.json"
            self.assertTrue(setup_path.exists())
            setup_payload = fetch_portal_setup()
            action_ids = {action["id"] for action in setup_payload["actions"]}

            self.assertEqual(Path(setup_payload["root"]).resolve(), ROOT)
            self.assertIn("runtime:node", action_ids)
            self.assertIn("env-file:hermes-agent", action_ids)
        finally:
            run_dispatcher("stop", "-Json")

    def test_portal_serves_backup_status(self):
        backup = run_dispatcher("backup", "-Json")
        self.assertEqual(backup.returncode, 0, backup.stderr)
        backup_payload = json.loads(backup.stdout)
        archive_path = Path(backup_payload["archivePath"])
        try:
            start = run_dispatcher("start", "-Json")
            self.assertEqual(start.returncode, 0, start.stderr)
            wait_for_portal()

            backups = fetch_portal_backups()

            self.assertEqual(Path(backups["backupRoot"]).resolve(), ROOT / "data" / "backups")
            self.assertGreaterEqual(backups["count"], 1)
            self.assertEqual(backups["latest"]["fileName"], archive_path.name)
            self.assertEqual(Path(backups["latest"]["path"]).resolve(), archive_path.resolve())
        finally:
            run_dispatcher("stop", "-Json")
            if archive_path.exists():
                archive_path.unlink()

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

    def test_start_fails_when_portal_port_is_occupied_by_another_process(self):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 17000))
            listener.listen(1)

            start = run_dispatcher("start", "-Json")

        self.assertNotEqual(start.returncode, 0)
        self.assertIn("Port 17000 is already in use", start.stderr)
        self.assertFalse((ROOT / "data" / "tmp" / "pids" / "portal.pid").exists())


if __name__ == "__main__":
    unittest.main()
