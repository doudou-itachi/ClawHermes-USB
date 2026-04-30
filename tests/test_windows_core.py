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
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DISPATCHER = ROOT / "core" / "windows" / "clawhermes.ps1"
NODE_CLI = ROOT / "core" / "node" / "dist" / "clawhermes.js"
PORTAL_URL = "http://127.0.0.1:17000/"


def run_dispatcher(*args):
    return run_dispatcher_for_root(ROOT, *args)


def run_dispatcher_for_root(usb_root, *args):
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
    )


def fetch_portal(timeout=0.5):
    with urllib.request.urlopen(PORTAL_URL, timeout=timeout) as response:
        return response.read().decode("utf-8")


def fetch_portal_status(timeout=0.5):
    with urllib.request.urlopen(f"{PORTAL_URL}status.json", timeout=timeout) as response:
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

        self.assertEqual(readiness["hermes-web-ui"]["status"], "candidate")
        self.assertFalse(readiness["hermes-web-ui"]["productionReady"])
        self.assertIn("hermes-web-ui start", readiness["hermes-web-ui"]["summary"])

        messages = "\n".join(payload["messages"])
        self.assertIn("Adapter openclaw integration is not production-ready", messages)
        self.assertIn("Adapter hermes-agent integration is not production-ready", messages)
        self.assertIn("Adapter hermes-web-ui integration is not production-ready", messages)

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

    def test_install_runtime_dry_run_reports_archive_plan(self):
        archive = ROOT / "data" / "tmp" / "node-runtime-test.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive, "w") as package:
            package.writestr("node-v22.0.0-win-x64/node.exe", "")

        result = run_dispatcher("install-runtime", "node", "--archive", str(archive), "--dry-run", "-Json")

        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["runtime"], "node")
        self.assertTrue(payload["dryRun"])
        self.assertEqual(payload["archive"], str(archive))
        self.assertTrue(payload["installDir"].endswith(str(Path("runtimes") / "windows" / "node")))
        self.assertTrue(payload["wouldExtract"])
        self.assertFalse(payload["installed"])
        self.assertTrue(any(path.endswith("node.exe") for path in payload["expectedExecutables"]))

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
