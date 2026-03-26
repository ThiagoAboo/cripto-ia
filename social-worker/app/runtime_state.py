from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RuntimeState:
    service_name: str = "social-worker"
    cycle_count: int = 0
    last_publish_at: Optional[str] = None
    last_error_at: Optional[str] = None
    provider_health: Dict[str, str] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def mark_publish(self, **metadata: Any) -> None:
        self.cycle_count += 1
        self.last_publish_at = _utc_now()
        self.metadata.update(metadata)

    def mark_provider(self, provider: str, status: str) -> None:
        self.provider_health[provider] = status

    def mark_error(self, error: Exception | str, **metadata: Any) -> None:
        self.last_error_at = _utc_now()
        self.metadata.update(metadata)
        self.metadata["last_error_message"] = str(error)

    def snapshot(self) -> Dict[str, Any]:
        return {
            "service_name": self.service_name,
            "cycle_count": self.cycle_count,
            "last_publish_at": self.last_publish_at,
            "last_error_at": self.last_error_at,
            "provider_health": dict(self.provider_health),
            "metadata": dict(self.metadata),
        }
