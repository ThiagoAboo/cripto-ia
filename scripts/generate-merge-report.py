#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

if len(sys.argv) != 2:
    print('Uso: python scripts/generate-merge-report.py /caminho/para/cripto-ia', file=sys.stderr)
    sys.exit(1)

root = Path(sys.argv[1]).resolve()
checks = {
    'training_recalibration': root / 'backend/src/services/trainingRecalibration.service.js',
    'decision_policy': root / 'backend/src/services/decisionPolicy.service.js',
    'backtest_validation': root / 'backend/src/services/backtestValidation.service.js',
    'governance_assessment': root / 'backend/src/services/governanceAssessment.service.js',
    'social_intelligence': root / 'backend/src/services/socialIntelligence.service.js',
    'live_governance': root / 'backend/src/services/liveGovernance.service.js',
    'system_manifest': root / 'backend/src/services/systemManifest.service.js',
    'frontend_shell': root / 'frontend/src/components/AppShell.jsx',
    'frontend_controller': root / 'frontend/src/hooks/useDashboardController.js',
    'ai_modular_base': root / 'ai/app/runtime_state.py',
    'social_modular_base': root / 'social-worker/app/runtime_state.py',
}
report = {
    'root': str(root),
    'checks': {name: path.exists() for name, path in checks.items()},
}
report['coverage_ratio'] = sum(report['checks'].values()) / len(report['checks'])
print(json.dumps(report, indent=2))
