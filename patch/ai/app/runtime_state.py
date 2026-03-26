from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class RuntimeState:
    service_name: str = "ai-worker"
    loop_count: int = 0
    last_success_at: Optional[str] = None
    last_error_at: Optional[str] = None
    last_error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def mark_success(self, **metadata: Any) -> None:
        self.loop_count += 1
        self.last_success_at = _utc_now()
        self.metadata.update(metadata)

    def mark_error(self, error: Exception | str, **metadata: Any) -> None:
        self.last_error_at = _utc_now()
        self.last_error_message = str(error)
        self.metadata.update(metadata)

    def snapshot(self) -> Dict[str, Any]:
        return {
            "service_name": self.service_name,
            "loop_count": self.loop_count,
            "last_success_at": self.last_success_at,
            "last_error_at": self.last_error_at,
            "last_error_message": self.last_error_message,
            "metadata": dict(self.metadata),
        }
