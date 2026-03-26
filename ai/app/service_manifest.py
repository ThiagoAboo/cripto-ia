from __future__ import annotations

from typing import Dict, List


def build_service_manifest() -> Dict[str, object]:
    modules: List[str] = [
        "runtime_state",
        "api_client",
        "loop_context",
        "feature_pipeline",
        "expert_router",
        "decision_loop",
    ]

    return {
        "service": "ai-worker",
        "extraction_strategy": "gradual",
        "current_main_file": "ai/main.py",
        "refactor_targets": [
            "network calls",
            "runtime state",
            "expert evaluation",
            "decision loop",
            "order publishing",
        ],
        "modules": modules,
        "notes": [
            "migrar helpers puros primeiro",
            "deixar main.py como bootstrap fino",
            "preservar compatibilidade do loop durante a extração",
        ],
    }
