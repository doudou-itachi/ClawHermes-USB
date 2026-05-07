import unittest

from launcher.pyqt.ui_theme import service_summary, status_tone


class PyQtUiThemeTests(unittest.TestCase):
    def test_status_tone_maps_service_state_to_visual_tokens(self):
        self.assertEqual(status_tone({"status": "running", "health": {"ready": True}})["name"], "ready")
        self.assertEqual(status_tone({"status": "running", "health": {"ready": False}})["name"], "warning")
        self.assertEqual(status_tone({"status": "stopped", "health": {"ready": False}})["name"], "stopped")
        self.assertEqual(status_tone({"status": "failed", "health": {"ready": False}})["name"], "error")

    def test_service_summary_counts_ready_warning_and_stopped_services(self):
        summary = service_summary(
            [
                {"status": "running", "health": {"ready": True}},
                {"status": "running", "health": {"ready": False}},
                {"status": "stopped", "health": {"ready": False}},
            ]
        )

        self.assertEqual(summary, {"total": 3, "ready": 1, "warning": 1, "stopped": 1})


if __name__ == "__main__":
    unittest.main()
