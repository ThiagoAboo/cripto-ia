import importlib.util
import pathlib
import unittest


def load_module():
    base = pathlib.Path(__file__).resolve().parents[1]
    module_path = base / "app" / "service_manifest.py"
    spec = importlib.util.spec_from_file_location("social_service_manifest", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


social_service_manifest = load_module()


class ServiceManifestTests(unittest.TestCase):
    def test_manifest_contains_provider_modules(self):
        manifest = social_service_manifest.build_service_manifest()
        self.assertEqual(manifest["service"], "social-worker")
        self.assertIn("provider_clients", manifest["modules"])


if __name__ == "__main__":
    unittest.main()
