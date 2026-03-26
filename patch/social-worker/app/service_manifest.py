from __future__ import annotations

from typing import Dict, List


def build_service_manifest() -> Dict[str, object]:
    modules: List[str] = [
        "runtime_state",
        "provider_clients",
        "narrative_scoring",
        "risk_radar",
        "publisher",
    ]

    return {
        "service": "social-worker",
        "extraction_strategy": "gradual",
        "current_main_file": "social-worker/main.py",
        "refactor_targets": [
            "provider polling",
            "provider health",
            "narrative scoring",
            "watchlist composition",
            "publishing to backend",
        ],
        "modules": modules,
        "notes": [
            "isolar providers primeiro",
            "deixar main.py como coordenador leve",
            "manter payload publicado compatível com backend atual",
        ],
    }
