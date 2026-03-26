#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Uso: bash scripts/check-cumulative-package.sh /caminho/para/cripto-ia" >&2
  exit 1
fi

TARGET=$(cd "$1" && pwd)
MISSING=0
WARN=0

required_files=(
  "backend/src/services/trainingRecalibration.service.js"
  "backend/src/services/decisionPolicy.service.js"
  "backend/src/services/backtestValidation.service.js"
  "backend/src/services/governanceAssessment.service.js"
  "backend/src/services/socialIntelligence.service.js"
  "backend/src/services/liveGovernance.service.js"
  "backend/src/services/systemManifest.service.js"
  "backend/src/routes/system.routes.js"
  "backend/src/db/migrations/032_live_governance.sql"
  "frontend/src/components/AppShell.jsx"
  "frontend/src/hooks/useDashboardController.js"
  "frontend/src/lib/live-governance.js"
  "frontend/src/lib/system-manifest.js"
  "ai/app/runtime_state.py"
  "social-worker/app/runtime_state.py"
)

for rel in "${required_files[@]}"; do
  if [ ! -f "$TARGET/$rel" ]; then
    echo "[MISSING] $rel"
    MISSING=1
  else
    echo "[OK] $rel"
  fi
done

if [ -f "$TARGET/backend/src/app.js" ]; then
  if ! grep -q "system.routes" "$TARGET/backend/src/app.js"; then
    echo "[WARN] backend/src/app.js ainda não referencia system.routes"
    WARN=1
  fi
  if ! grep -q "/api/system" "$TARGET/backend/src/app.js"; then
    echo "[WARN] backend/src/app.js ainda não monta /api/system"
    WARN=1
  fi
fi

if [ -f "$TARGET/backend/package.json" ] && ! grep -q '"test"' "$TARGET/backend/package.json"; then
  echo "[WARN] backend/package.json sem script de test"
  WARN=1
fi

if [ -f "$TARGET/frontend/package.json" ] && ! grep -q '"test"' "$TARGET/frontend/package.json"; then
  echo "[WARN] frontend/package.json sem script de test"
  WARN=1
fi

if [ "$MISSING" -ne 0 ]; then
  echo "Checagem falhou: há arquivos obrigatórios ausentes." >&2
  exit 2
fi

if [ "$WARN" -ne 0 ]; then
  echo "Checagem concluída com avisos." >&2
  exit 3
fi

echo "Checagem concluída sem pendências estruturais."
