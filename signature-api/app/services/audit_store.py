"""Stockage des événements d'audit dans Redis."""
import json
from datetime import datetime, timezone
from app.services.cache import CacheService

AUDIT_KEY = "audit:events"


class AuditStore:

    @classmethod
    async def log(cls, event: dict):
        event.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        raw = await CacheService.get(AUDIT_KEY)
        events = json.loads(raw) if raw else []
        events.append(event)
        # Garder les 10 000 derniers événements
        if len(events) > 10000:
            events = events[-10000:]
        await CacheService.set(AUDIT_KEY, json.dumps(events, ensure_ascii=False).encode(),
                               ttl=86400 * 90)

    @classmethod
    async def get_all(cls, limit: int = 100) -> list:
        raw = await CacheService.get(AUDIT_KEY)
        if raw is None:
            return []
        events = json.loads(raw)
        return list(reversed(events[-limit:]))
