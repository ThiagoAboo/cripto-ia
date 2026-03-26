import importlib.util
import pathlib
import unittest


def load_module():
    base = pathlib.Path(__file__).resolve().parents[1]
    module_path = base / "app" / "runtime_state.py"
    spec = importlib.util.spec_from_file_location("social_runtime_state", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


social_runtime_state = load_module()


class RuntimeStateTests(unittest.TestCase):
    def test_mark_publish_updates_cycle_count(self):
        state = social_runtime_state.RuntimeState()
        state.mark_publish(top_symbol="BTC")

        snapshot = state.snapshot()
        self.assertEqual(snapshot["cycle_count"], 1)
        self.assertEqual(snapshot["metadata"]["top_symbol"], "BTC")

    def test_provider_health_is_recorded(self):
        state = social_runtime_state.RuntimeState()
        state.mark_provider("reddit", "healthy")
        self.assertEqual(state.snapshot()["provider_health"]["reddit"], "healthy")


if __name__ == "__main__":
    unittest.main()
