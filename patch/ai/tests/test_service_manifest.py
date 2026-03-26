import unittest

from ai.app.service_manifest import build_service_manifest


class ServiceManifestTests(unittest.TestCase):
    def test_manifest_contains_gradual_extraction(self):
        manifest = build_service_manifest()
        self.assertEqual(manifest["service"], "ai-worker")
        self.assertEqual(manifest["extraction_strategy"], "gradual")
        self.assertIn("decision_loop", manifest["modules"])


if __name__ == "__main__":
    unittest.main()
