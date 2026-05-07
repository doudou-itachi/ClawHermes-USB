TONE_READY = {
    "name": "ready",
    "label": "Ready",
    "color": "#10b981",
    "background": "#dcfce7",
}
TONE_WARNING = {
    "name": "warning",
    "label": "Starting",
    "color": "#f59e0b",
    "background": "#fef3c7",
}
TONE_STOPPED = {
    "name": "stopped",
    "label": "Stopped",
    "color": "#64748b",
    "background": "#e2e8f0",
}
TONE_ERROR = {
    "name": "error",
    "label": "Error",
    "color": "#ef4444",
    "background": "#fee2e2",
}


def status_tone(service: dict) -> dict:
    status = str(service.get("status") or "").lower()
    health = service.get("health") or {}

    if status in {"failed", "error", "crashed"}:
        return TONE_ERROR
    if status == "stopped":
        return TONE_STOPPED
    if health.get("ready"):
        return TONE_READY
    if status in {"running", "starting", "placeholder-started"}:
        return TONE_WARNING
    return TONE_STOPPED


def service_summary(services: list[dict]) -> dict:
    summary = {"total": len(services), "ready": 0, "warning": 0, "stopped": 0}
    for service in services:
        name = status_tone(service)["name"]
        if name == "ready":
            summary["ready"] += 1
        elif name in {"warning", "error"}:
            summary["warning"] += 1
        else:
            summary["stopped"] += 1
    return summary
