import unittest

from ai.app.runtime_state import RuntimeState


class RuntimeStateTests(unittest.TestCase):
    def test_mark_success_updates_snapshot(self):
        state = RuntimeState()
        state.mark_success(symbol="BTCUSDT")

        snapshot = state.snapshot()
        self.assertEqual(snapshot["loop_count"], 1)
        self.assertEqual(snapshot["metadata"]["symbol"], "BTCUSDT")
        self.assertIsNotNone(snapshot["last_success_at"])

    def test_mark_error_keeps_message(self):
        state = RuntimeState()
        state.mark_error("falha de rede", symbol="ETHUSDT")

        snapshot = state.snapshot()
        self.assertEqual(snapshot["last_error_message"], "falha de rede")
        self.assertEqual(snapshot["metadata"]["symbol"], "ETHUSDT")


if __name__ == "__main__":
    unittest.main()
