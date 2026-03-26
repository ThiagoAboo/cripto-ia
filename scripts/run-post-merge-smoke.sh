#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Uso: bash scripts/run-post-merge-smoke.sh /caminho/para/cripto-ia" >&2
  exit 1
fi

TARGET=$(cd "$1" && pwd)

pushd "$TARGET" >/dev/null

echo "== Backend tests =="
if [ -f backend/package.json ]; then
  (cd backend && npm test)
else
  echo "backend/package.json não encontrado" >&2
  exit 2
fi

echo "== Frontend tests =="
if [ -f frontend/package.json ]; then
  (cd frontend && npm test)
else
  echo "frontend/package.json não encontrado" >&2
  exit 2
fi

echo "== Python unit tests =="
python -m unittest   ai.tests.test_runtime_state   ai.tests.test_service_manifest   social-worker.tests.test_runtime_state   social-worker.tests.test_service_manifest   social-worker.tests.test_social_model

popd >/dev/null
