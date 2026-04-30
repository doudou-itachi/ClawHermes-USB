import json
import os
import socket
import subprocess
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DISPATCHER = ROOT / "core" / "windows" / "clawhermes.ps1"
NODE_CLI = ROOT / "core" / "node" / "dist" / "clawhermes.js"
PORTAL_URL = "http://127.0.0.1:17000/"


def run_dispatcher(*args):
    command = [
        "node",
        str(NODE_CLI),
        *args,
        "--usb-root",
        str(ROOT),
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

        launcher_log = ROOT / "data" / "logs" / "launcher.log"
        self.assertTrue(launcher_log.exists())
        self.assertIn("Started placeholder service", launcher_log.read_text(encoding="utf-8"))

        status = run_dispatcher("status", "-Json")
        self.assertEqual(status.returncode, 0, status.stderr)
        status_payload = json.loads(status.stdout)
        statuses = {service["id"]: service["status"] for service in status_payload["services"]}
        self.assertEqual(statuses["openclaw"], "placeholder-started")
        self.assertEqual(statuses["hermes-agent"], "placeholder-started")
        self.assertEqual(statuses["hermes-web-ui"], "placeholder-started")

        stop = run_dispatcher("stop", "-Json")
        self.assertEqual(stop.returncode, 0, stop.stderr)
        stop_payload = json.loads(stop.stdout)
        self.assertEqual(
            stop_payload["stopped"],
            ["portal", "hermes-web-ui", "hermes-agent", "openclaw"],
        )

        for service_id in start_payload["started"]:
            self.assertFalse((pid_dir / f"{service_id}.pid").exists())

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
