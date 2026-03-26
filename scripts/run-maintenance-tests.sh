#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-.}"

echo "== backend tests =="
node --test \
  "$ROOT_DIR/backend/tests/systemManifest.service.test.cjs" \
  "$ROOT_DIR/backend/tests/system.routes.test.cjs"

echo "== frontend tests =="
node --test \
  "$ROOT_DIR/frontend/src/lib/contracts.test.js" \
  "$ROOT_DIR/frontend/src/lib/system-manifest.test.js"

echo "== python tests =="
PYTHONPATH="$ROOT_DIR" python -m unittest \
  ai.tests.test_runtime_state \
  ai.tests.test_service_manifest
python -m unittest \
  discover -s "$ROOT_DIR/social-worker/tests" -p "test_*.py"
