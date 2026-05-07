import json
import os
import subprocess
import sys
import time
from pathlib import Path

from PyQt6.QtCore import Qt, QTimer, QUrl
from PyQt6.QtGui import QDesktopServices
from PyQt6.QtNetwork import QNetworkAccessManager, QNetworkReply, QNetworkRequest
from PyQt6.QtWidgets import (
    QApplication,
    QFrame,
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QStackedWidget,
    QStyle,
    QVBoxLayout,
    QWidget,
)

try:
    from ui_theme import service_summary, status_tone
except ImportError:
    from launcher.pyqt.ui_theme import service_summary, status_tone


class ServiceCard(QFrame):
    def __init__(self, open_callback):
        super().__init__()
        self.open_callback = open_callback
        self.url = ""
        self.setObjectName("ServiceCard")
        self.setMinimumHeight(150)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

        self.dot = QLabel()
        self.dot.setObjectName("StatusDot")
        self.title = QLabel()
        self.title.setObjectName("ServiceTitle")
        self.status = QLabel()
        self.status.setObjectName("StatusPill")
        self.health = QLabel()
        self.health.setObjectName("ServiceHealth")
        self.url_label = QLabel()
        self.url_label.setObjectName("ServiceUrl")
        self.url_label.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)

        self.open_button = QPushButton("打开")
        self.open_button.setObjectName("GhostButton")
        self.open_button.clicked.connect(self.open_url)

        title_row = QHBoxLayout()
        title_row.addWidget(self.dot)
        title_row.addWidget(self.title, 1)
        title_row.addWidget(self.status)

        bottom_row = QHBoxLayout()
        bottom_row.addWidget(self.url_label, 1)
        bottom_row.addWidget(self.open_button)

        layout = QVBoxLayout()
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(12)
        layout.addLayout(title_row)
        layout.addWidget(self.health)
        layout.addStretch(1)
        layout.addLayout(bottom_row)
        self.setLayout(layout)

    def update_service(self, service: dict):
        tone = status_tone(service)
        health = service.get("health") or {}
        self.url = service.get("portalUrl") or ""
        self.title.setText(service.get("displayName") or service.get("id") or "Service")
        self.status.setText(tone["label"])
        self.health.setText("ready" if health.get("ready") else health.get("reason", "not ready"))
        self.url_label.setText(self.url or "No local URL")
        self.open_button.setEnabled(bool(self.url))
        self.dot.setStyleSheet(f"background: {tone['color']};")
        self.status.setStyleSheet(f"color: {tone['color']}; background: {tone['background']};")

    def open_url(self):
        if self.url:
            self.open_callback(self.url)


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
        self.service_cards: dict[str, ServiceCard] = {}
        self.setWindowTitle("ClawHermes Control")
        self.resize(1180, 760)
        self.setMinimumSize(1020, 680)

        self.stack = QStackedWidget()
        self.nav_buttons: list[QPushButton] = []
        self.service_grid = QGridLayout()
        self.summary_labels: dict[str, QLabel] = {}
        self.overall_status = QLabel("等待服务状态")
        self.overall_status.setObjectName("OverallStatus")
        self.log_view = QPlainTextEdit()
        self.log_view.setReadOnly(True)
        self.api_url = QLineEdit()
        self.model_name = QLineEdit()
        self.api_key = QLineEdit()
        self.api_key.setEchoMode(QLineEdit.EchoMode.Password)
        self.setup_ui()

        self.timer = QTimer(self)
        self.timer.timeout.connect(self.refresh_status)
        self.timer.start(1500)
        self.refresh_status()
        self.get_json("/api/model-config")
        self.get_json("/api/logs?service=launcher&lines=120")

    def setup_ui(self):
        self.setStyleSheet(APP_STYLE)

        sidebar = self.build_sidebar()
        content = QWidget()
        content.setObjectName("Content")
        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(26, 22, 26, 22)
        content_layout.setSpacing(18)
        content_layout.addLayout(self.build_header())
        content_layout.addWidget(self.stack, 1)
        content.setLayout(content_layout)

        shell = QWidget()
        shell_layout = QHBoxLayout()
        shell_layout.setContentsMargins(0, 0, 0, 0)
        shell_layout.setSpacing(0)
        shell_layout.addWidget(sidebar)
        shell_layout.addWidget(content, 1)
        shell.setLayout(shell_layout)
        self.setCentralWidget(shell)

        self.stack.addWidget(self.build_dashboard_page())
        self.stack.addWidget(self.build_model_page())
        self.stack.addWidget(self.build_logs_page())
        self.stack.addWidget(self.build_settings_page())
        self.select_page(0)

    def build_sidebar(self) -> QFrame:
        sidebar = QFrame()
        sidebar.setObjectName("Sidebar")
        sidebar.setFixedWidth(220)

        logo = QLabel("CH")
        logo.setObjectName("Logo")
        title = QLabel("ClawHermes")
        title.setObjectName("AppTitle")
        subtitle = QLabel("Portable Control")
        subtitle.setObjectName("AppSubtitle")

        brand_text = QVBoxLayout()
        brand_text.setSpacing(2)
        brand_text.addWidget(title)
        brand_text.addWidget(subtitle)

        brand = QHBoxLayout()
        brand.setSpacing(10)
        brand.addWidget(logo)
        brand.addLayout(brand_text)

        layout = QVBoxLayout()
        layout.setContentsMargins(18, 22, 18, 22)
        layout.setSpacing(12)
        layout.addLayout(brand)
        layout.addSpacing(24)

        nav = [
            ("控制台", QStyle.StandardPixmap.SP_ComputerIcon),
            ("模型配置", QStyle.StandardPixmap.SP_FileDialogDetailedView),
            ("运行日志", QStyle.StandardPixmap.SP_FileIcon),
            ("设置", QStyle.StandardPixmap.SP_FileDialogInfoView),
        ]
        for index, (label, icon) in enumerate(nav):
            button = QPushButton(label)
            button.setObjectName("NavButton")
            button.setCheckable(True)
            button.setIcon(self.style().standardIcon(icon))
            button.clicked.connect(lambda checked=False, page=index: self.select_page(page))
            layout.addWidget(button)
            self.nav_buttons.append(button)

        layout.addStretch(1)
        version = QLabel("本地控制服务")
        version.setObjectName("SidebarFootnote")
        layout.addWidget(version)
        sidebar.setLayout(layout)
        return sidebar

    def build_header(self) -> QHBoxLayout:
        title_box = QVBoxLayout()
        title = QLabel("控制台")
        title.setObjectName("PageTitle")
        subtitle = QLabel(f"USB root: {self.root}")
        subtitle.setObjectName("PageSubtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)

        start_button = QPushButton("启动")
        start_button.setObjectName("PrimaryButton")
        start_button.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_MediaPlay))
        stop_button = QPushButton("停止")
        stop_button.setObjectName("DangerButton")
        stop_button.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_MediaStop))
        refresh_button = QPushButton("刷新")
        refresh_button.setObjectName("SecondaryButton")
        refresh_button.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_BrowserReload))
        start_button.clicked.connect(lambda: self.post_json("/api/services/start", {}))
        stop_button.clicked.connect(lambda: self.post_json("/api/services/stop", {}))
        refresh_button.clicked.connect(self.refresh_status)

        actions = QHBoxLayout()
        actions.setSpacing(10)
        actions.addWidget(start_button)
        actions.addWidget(stop_button)
        actions.addWidget(refresh_button)

        header = QHBoxLayout()
        header.addLayout(title_box, 1)
        header.addWidget(self.overall_status)
        header.addLayout(actions)
        return header

    def build_dashboard_page(self) -> QWidget:
        page = QWidget()
        page_layout = QVBoxLayout()
        page_layout.setContentsMargins(0, 0, 0, 0)
        page_layout.setSpacing(16)

        summary = QHBoxLayout()
        summary.setSpacing(12)
        for key, label in [("total", "服务"), ("ready", "就绪"), ("warning", "注意"), ("stopped", "停止")]:
            card = QFrame()
            card.setObjectName("MetricCard")
            value = QLabel("0")
            value.setObjectName("MetricValue")
            caption = QLabel(label)
            caption.setObjectName("MetricLabel")
            card_layout = QVBoxLayout()
            card_layout.setContentsMargins(18, 14, 18, 14)
            card_layout.addWidget(value)
            card_layout.addWidget(caption)
            card.setLayout(card_layout)
            summary.addWidget(card)
            self.summary_labels[key] = value
        page_layout.addLayout(summary)

        services_panel = QFrame()
        services_panel.setObjectName("Panel")
        panel_layout = QVBoxLayout()
        panel_layout.setContentsMargins(18, 18, 18, 18)
        panel_title = QLabel("服务状态")
        panel_title.setObjectName("SectionTitle")
        self.service_grid.setSpacing(14)
        panel_layout.addWidget(panel_title)
        panel_layout.addLayout(self.service_grid)
        services_panel.setLayout(panel_layout)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setWidget(services_panel)
        page_layout.addWidget(scroll, 1)
        page.setLayout(page_layout)
        return page

    def build_model_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        panel = QFrame()
        panel.setObjectName("Panel")
        form = QVBoxLayout()
        form.setContentsMargins(22, 22, 22, 22)
        form.setSpacing(14)
        title = QLabel("模型配置")
        title.setObjectName("SectionTitle")
        note = QLabel("保存后会写入 OpenClaw 和 Hermes 使用的本地配置。")
        note.setObjectName("MutedText")
        self.api_url.setPlaceholderText("API URL / Base URL")
        self.model_name.setPlaceholderText("Model")
        self.api_key.setPlaceholderText("API Key")

        save_model_button = QPushButton("保存模型")
        save_model_button.setObjectName("PrimaryButton")
        save_model_button.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_DialogSaveButton))
        save_model_button.clicked.connect(self.save_model_config)

        form.addWidget(title)
        form.addWidget(note)
        form.addWidget(self.api_url)
        form.addWidget(self.model_name)
        form.addWidget(self.api_key)
        form.addWidget(save_model_button, 0, Qt.AlignmentFlag.AlignLeft)
        form.addStretch(1)
        panel.setLayout(form)
        layout.addWidget(panel)
        layout.addStretch(1)
        page.setLayout(layout)
        return page

    def build_logs_page(self) -> QWidget:
        page = QWidget()
        layout = QVBoxLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)
        toolbar = QHBoxLayout()
        title = QLabel("运行日志")
        title.setObjectName("SectionTitle")
        refresh_logs = QPushButton("刷新日志")
        refresh_logs.setObjectName("SecondaryButton")
        refresh_logs.setIcon(self.style().standardIcon(QStyle.StandardPixmap.SP_BrowserReload))
        refresh_logs.clicked.connect(lambda: self.get_json("/api/logs?service=launcher&lines=120"))
        toolbar.addWidget(title, 1)
        toolbar.addWidget(refresh_logs)

        self.log_view.setObjectName("LogView")
        layout.addLayout(toolbar)
        layout.addWidget(self.log_view, 1)
        page.setLayout(layout)
        return page

    def build_settings_page(self) -> QWidget:
        page = QWidget()
        panel = QFrame()
        panel.setObjectName("Panel")
        layout = QVBoxLayout()
        layout.setContentsMargins(22, 22, 22, 22)
        layout.setSpacing(12)
        title = QLabel("设置")
        title.setObjectName("SectionTitle")
        root = QLabel(str(self.root))
        root.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        control = QLabel(self.control_url)
        control.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        layout.addWidget(title)
        layout.addWidget(QLabel("USB root"))
        layout.addWidget(root)
        layout.addWidget(QLabel("Control server"))
        layout.addWidget(control)
        layout.addStretch(1)
        panel.setLayout(layout)

        page_layout = QVBoxLayout()
        page_layout.setContentsMargins(0, 0, 0, 0)
        page_layout.addWidget(panel)
        page_layout.addStretch(1)
        page.setLayout(page_layout)
        return page

    def select_page(self, index: int):
        self.stack.setCurrentIndex(index)
        for button_index, button in enumerate(self.nav_buttons):
            button.setChecked(button_index == index)

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
            self.get_json("/api/logs?service=launcher&lines=120")

    def render_status(self, payload: dict):
        services = payload.get("services", [])
        summary = service_summary(services)
        for key, value in summary.items():
            if key in self.summary_labels:
                self.summary_labels[key].setText(str(value))
        self.overall_status.setText(
            f"{summary['ready']}/{summary['total']} ready"
            if summary["total"]
            else "等待服务状态"
        )
        self.overall_status.setProperty("tone", "ready" if summary["ready"] == summary["total"] and summary["total"] else "warning")
        self.overall_status.style().unpolish(self.overall_status)
        self.overall_status.style().polish(self.overall_status)

        self.clear_service_grid()
        for row, service in enumerate(services):
            card = ServiceCard(self.open_local_url)
            card.update_service(service)
            self.service_grid.addWidget(card, row // 2, row % 2)
        self.service_grid.setRowStretch((len(services) + 1) // 2, 1)

    def clear_service_grid(self):
        while self.service_grid.count():
            item = self.service_grid.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()

    def render_logs(self, payload: dict):
        self.log_view.setPlainText("\n".join(payload.get("lines", [])))

    def render_model_status(self, payload: dict):
        config = payload.get("config") or {}
        if config:
            self.api_url.setText(config.get("apiUrl") or "")
            self.model_name.setText(config.get("model") or "")

    def open_local_url(self, url: str):
        QDesktopServices.openUrl(QUrl(url))

    def closeEvent(self, event):
        self.cleanup_before_exit()
        event.accept()

    def cleanup_before_exit(self):
        try:
            self.timer.stop()
        except Exception:
            pass
        try:
            self.network.finished.disconnect(self.on_reply)
        except Exception:
            pass
        metadata = self.read_control_metadata()
        self.post_json_blocking("/api/services/stop", {})
        self.post_json_blocking("/api/shutdown", {})
        if not self.wait_for_control_server_shutdown():
            self.kill_control_server_from_metadata(metadata)
            self.wait_for_control_server_shutdown(timeout=2.0)

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

    def wait_for_control_server_shutdown(self, timeout: float = 8.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if not self.ping(self.control_url):
                return True
            QApplication.processEvents()
            time.sleep(0.1)
        return False

    def kill_control_server_from_metadata(self, metadata):
        if not metadata or not metadata.get("processId"):
            return
        if os.name != "nt":
            return
        try:
            subprocess.run(
                ["taskkill", "/PID", str(metadata["processId"]), "/T", "/F"],
                cwd=os.environ.get("SystemRoot", None),
                text=True,
                capture_output=True,
                check=False,
                **hidden_subprocess_kwargs(),
            )
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


APP_STYLE = """
QMainWindow {
    background: #f5f7fb;
    color: #172033;
    font-family: "Microsoft YaHei UI", "Segoe UI", sans-serif;
    font-size: 14px;
}
QFrame#Sidebar {
    background: #101828;
}
QLabel#Logo {
    min-width: 42px;
    max-width: 42px;
    min-height: 42px;
    max-height: 42px;
    border-radius: 12px;
    background: #2563eb;
    color: white;
    font-size: 18px;
    font-weight: 800;
    qproperty-alignment: AlignCenter;
}
QLabel#AppTitle {
    color: white;
    font-size: 18px;
    font-weight: 700;
}
QLabel#AppSubtitle,
QLabel#SidebarFootnote {
    color: #94a3b8;
    font-size: 12px;
}
QPushButton#NavButton {
    text-align: left;
    border: 0;
    border-radius: 10px;
    padding: 12px 14px;
    color: #cbd5e1;
    background: transparent;
}
QPushButton#NavButton:hover {
    background: #1e293b;
    color: white;
}
QPushButton#NavButton:checked {
    background: #2563eb;
    color: white;
}
QWidget#Content {
    background: #f5f7fb;
}
QLabel#PageTitle {
    font-size: 26px;
    font-weight: 800;
    color: #0f172a;
}
QLabel#PageSubtitle,
QLabel#MutedText {
    color: #64748b;
    font-size: 13px;
}
QLabel#SectionTitle {
    color: #0f172a;
    font-size: 18px;
    font-weight: 750;
}
QLabel#OverallStatus {
    border-radius: 999px;
    padding: 8px 13px;
    color: #92400e;
    background: #fef3c7;
    font-weight: 700;
}
QLabel#OverallStatus[tone="ready"] {
    color: #047857;
    background: #d1fae5;
}
QFrame#Panel,
QFrame#MetricCard,
QFrame#ServiceCard {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 14px;
}
QFrame#MetricCard {
    min-height: 76px;
}
QLabel#MetricValue {
    color: #0f172a;
    font-size: 28px;
    font-weight: 800;
}
QLabel#MetricLabel {
    color: #64748b;
    font-size: 13px;
}
QLabel#StatusDot {
    min-width: 10px;
    max-width: 10px;
    min-height: 10px;
    max-height: 10px;
    border-radius: 5px;
}
QLabel#ServiceTitle {
    color: #0f172a;
    font-size: 16px;
    font-weight: 750;
}
QLabel#StatusPill {
    border-radius: 999px;
    padding: 5px 10px;
    font-size: 12px;
    font-weight: 700;
}
QLabel#ServiceHealth {
    color: #334155;
}
QLabel#ServiceUrl {
    color: #2563eb;
    font-size: 12px;
}
QLineEdit {
    border: 1px solid #d7dde8;
    border-radius: 10px;
    padding: 11px 12px;
    background: white;
    color: #0f172a;
}
QLineEdit:focus {
    border: 1px solid #2563eb;
}
QPlainTextEdit#LogView {
    border: 1px solid #172033;
    border-radius: 14px;
    background: #0b1220;
    color: #dbeafe;
    padding: 12px;
    font-family: "Cascadia Mono", Consolas, monospace;
    font-size: 12px;
}
QPushButton#PrimaryButton,
QPushButton#SecondaryButton,
QPushButton#DangerButton,
QPushButton#GhostButton {
    border: 0;
    border-radius: 10px;
    padding: 10px 14px;
    font-weight: 700;
}
QPushButton#PrimaryButton {
    background: #2563eb;
    color: white;
}
QPushButton#PrimaryButton:hover {
    background: #1d4ed8;
}
QPushButton#SecondaryButton {
    background: #e2e8f0;
    color: #0f172a;
}
QPushButton#SecondaryButton:hover {
    background: #cbd5e1;
}
QPushButton#DangerButton {
    background: #fee2e2;
    color: #b91c1c;
}
QPushButton#DangerButton:hover {
    background: #fecaca;
}
QPushButton#GhostButton {
    background: #eff6ff;
    color: #1d4ed8;
}
QPushButton#GhostButton:disabled {
    background: #f1f5f9;
    color: #94a3b8;
}
QScrollArea {
    background: transparent;
}
"""


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
