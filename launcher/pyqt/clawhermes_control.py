import json
import os
import subprocess
import sys
from pathlib import Path

from PyQt6.QtCore import QTimer, QUrl
from PyQt6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest
from PyQt6.QtWidgets import (
    QApplication,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QPlainTextEdit,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)


class ClawHermesControl(QMainWindow):
    def __init__(self):
        super().__init__()
        self.root = find_usb_root()
        self.control_url = self.ensure_control_server()
        self.network = QNetworkAccessManager(self)
        self.network.finished.connect(self.on_reply)
        self.status_request_seq = 0
        self.latest_status_seq = 0
        self.status_in_flight = False
        self.setWindowTitle("ClawHermes Control")
        self.resize(980, 680)
        self.status_table = QTableWidget(0, 4)
        self.status_table.setHorizontalHeaderLabels(["Service", "Status", "Health", "URL"])
        self.log_view = QPlainTextEdit()
        self.log_view.setReadOnly(True)
        self.api_url = QLineEdit()
        self.model_name = QLineEdit()
        self.api_key = QLineEdit()
        self.api_key.setEchoMode(QLineEdit.EchoMode.Password)
        self.build_ui()
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh_status)
        self.timer.start(1500)
        self.refresh_status()
        self.get_json("/api/model-config")
        self.get_json("/api/logs?service=launcher&lines=80")

    def build_ui(self):
        root_label = QLabel(str(self.root))
        start_button = QPushButton("Start")
        stop_button = QPushButton("Stop")
        refresh_button = QPushButton("Refresh")
        save_model_button = QPushButton("Save Model")
        start_button.clicked.connect(lambda: self.post_json("/api/services/start", {}))
        stop_button.clicked.connect(lambda: self.post_json("/api/services/stop", {}))
        refresh_button.clicked.connect(self.refresh_status)
        save_model_button.clicked.connect(self.save_model_config)

        buttons = QHBoxLayout()
        buttons.addWidget(start_button)
        buttons.addWidget(stop_button)
        buttons.addWidget(refresh_button)

        model_form = QHBoxLayout()
        self.api_url.setPlaceholderText("API URL / Base URL")
        self.model_name.setPlaceholderText("Model")
        self.api_key.setPlaceholderText("API Key")
        model_form.addWidget(self.api_url)
        model_form.addWidget(self.model_name)
        model_form.addWidget(self.api_key)
        model_form.addWidget(save_model_button)

        layout = QVBoxLayout()
        layout.addWidget(QLabel("USB root"))
        layout.addWidget(root_label)
        layout.addLayout(buttons)
        layout.addWidget(self.status_table)
        layout.addLayout(model_form)
        layout.addWidget(QLabel("Logs"))
        layout.addWidget(self.log_view)

        container = QWidget()
        container.setLayout(layout)
        self.setCentralWidget(container)

    def ensure_control_server(self) -> str:
        metadata = self.read_control_metadata()
        if metadata and self.ping(metadata.get("url")):
            return metadata["url"].rstrip("/")
        command = node_command(self.root) + [
            str(self.root / "core" / "node" / "dist" / "clawhermes.js"),
            "control-server",
            "--usb-root",
            str(self.root),
            "--port",
            "0",
            "--json",
        ]
        completed = subprocess.run(
            command,
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
            **hidden_subprocess_kwargs(),
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or "Failed to start control server.")
        payload = json.loads(completed.stdout)
        return payload["url"].rstrip("/")

    def read_control_metadata(self):
        path = self.root / "data" / "tmp" / "control-server.json"
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def ping(self, url: str | None) -> bool:
        if not url:
            return False
        try:
            import urllib.request

            with urllib.request.urlopen(url.rstrip("/") + "/api/health", timeout=0.5) as response:
                return response.status == 200
        except Exception:
            return False

    def refresh_status(self):
        if self.status_in_flight:
            return
        self.get_json("/api/status")

    def save_model_config(self):
        self.post_json(
            "/api/model-config",
            {
                "providerType": "openai-compatible",
                "apiUrl": self.api_url.text(),
                "model": self.model_name.text(),
                "apiKey": self.api_key.text(),
                "apply": "both",
            },
        )

    def get_json(self, path: str):
        request = QNetworkRequest(QUrl(self.control_url + path))
        reply = self.network.get(request)
        if path == "/api/status":
            self.status_request_seq += 1
            self.status_in_flight = True
            reply.setProperty("statusSeq", self.status_request_seq)

    def post_json(self, path: str, payload: dict):
        request = QNetworkRequest(QUrl(self.control_url + path))
        request.setHeader(QNetworkRequest.KnownHeaders.ContentTypeHeader, "application/json")
        self.network.post(request, json.dumps(payload).encode("utf-8"))

    def on_reply(self, reply: QNetworkReply):
        path = reply.url().path()
        status_seq = reply.property("statusSeq") if path == "/api/status" else None
        raw = bytes(reply.readAll()).decode("utf-8", errors="replace")
        reply.deleteLater()
        if path == "/api/status":
            self.status_in_flight = False
            if isinstance(status_seq, int) and status_seq < self.latest_status_seq:
                return
        if reply.error() != QNetworkReply.NetworkError.NoError:
            self.log_view.appendPlainText(raw or reply.errorString())
            return
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            self.log_view.appendPlainText(raw)
            return
        if path == "/api/status":
            if isinstance(status_seq, int):
                self.latest_status_seq = status_seq
            self.render_status(payload)
        elif path == "/api/logs":
            self.render_logs(payload)
        elif path == "/api/model-config":
            self.render_model_status(payload)
        else:
            self.log_view.appendPlainText(json.dumps(payload, ensure_ascii=False, indent=2))
            self.refresh_status()

    def render_status(self, payload: dict):
        services = payload.get("services", [])
        self.status_table.setRowCount(len(services))
        for row, service in enumerate(services):
            health = service.get("health") or {}
            self.status_table.setItem(row, 0, QTableWidgetItem(service.get("displayName") or service.get("id") or ""))
            self.status_table.setItem(row, 1, QTableWidgetItem(service.get("status") or "unknown"))
            self.status_table.setItem(row, 2, QTableWidgetItem("ready" if health.get("ready") else health.get("reason", "not ready")))
            self.status_table.setItem(row, 3, QTableWidgetItem(service.get("portalUrl") or ""))
        self.status_table.resizeColumnsToContents()

    def render_logs(self, payload: dict):
        self.log_view.setPlainText("\n".join(payload.get("lines", [])))

    def render_model_status(self, payload: dict):
        config = payload.get("config") or {}
        if config:
            self.api_url.setText(config.get("apiUrl") or "")
            self.model_name.setText(config.get("model") or "")

    def closeEvent(self, event):
        self.post_json_blocking("/api/services/stop", {})
        self.post_json_blocking("/api/shutdown", {})
        event.accept()

    def post_json_blocking(self, path: str, payload: dict):
        try:
            import urllib.request

            data = json.dumps(payload).encode("utf-8")
            request = urllib.request.Request(
                self.control_url + path,
                data=data,
                method="POST",
                headers={"content-type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=5):
                pass
        except Exception:
            pass


def find_usb_root() -> Path:
    override = os.environ.get("CLAWHERMES_USB_ROOT")
    if override:
        return Path(override).resolve()
    start = Path(sys.executable if getattr(sys, "frozen", False) else __file__).resolve()
    for candidate in [start.parent, *start.parents]:
        if (candidate / "core" / "node" / "dist" / "clawhermes.js").exists():
            return candidate
    return start.parent


def node_command(root: Path) -> list[str]:
    portable = root / "runtimes" / "windows" / "node" / "node.exe"
    if portable.exists():
        return [str(portable)]
    return ["node"]


def hidden_subprocess_kwargs() -> dict:
    if os.name != "nt":
        return {}
    startupinfo = subprocess.STARTUPINFO()
    startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startupinfo.wShowWindow = subprocess.SW_HIDE
    return {
        "creationflags": subprocess.CREATE_NO_WINDOW,
        "startupinfo": startupinfo,
    }


def main() -> int:
    app = QApplication(sys.argv)
    try:
        window = ClawHermesControl()
    except Exception as exc:
        QMessageBox.critical(None, "ClawHermes Control", str(exc))
        return 1
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
