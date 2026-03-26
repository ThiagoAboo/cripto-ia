#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:4000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

echo "== Backend root =="
curl -fsS "${API_BASE_URL}/" | sed 's/.*/OK root backend/'

echo "== Health =="
curl -fsS "${API_BASE_URL}/api/health" | sed 's/.*/OK health/'

echo "== Status =="
curl -fsS "${API_BASE_URL}/api/status" | sed 's/.*/OK status/'

echo "== Training summary =="
curl -fsS "${API_BASE_URL}/api/training/summary" | sed 's/.*/OK training summary/'

echo "== Frontend =="
curl -fsS "${FRONTEND_URL}" >/dev/null
echo "OK frontend"
