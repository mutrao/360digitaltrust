"""Stockage des workflows dans Redis."""
import json
from typing import Optional
from app.services.cache import CacheService

PREFIX = "workflow:"
INDEX_KEY = "workflows:index"


class WorkflowStore:

    @classmethod
    async def save(cls, workflow_id: str, data: dict):
        serialized = json.dumps(data, ensure_ascii=False).encode()
        await CacheService.set(f"{PREFIX}{workflow_id}", serialized, ttl=86400 * 30)
        # Maintenir un index
        index = await cls._get_index()
        if workflow_id not in index:
            index.append(workflow_id)
        await CacheService.set(INDEX_KEY, json.dumps(index).encode(), ttl=86400 * 30)

    @classmethod
    async def get(cls, workflow_id: str) -> Optional[dict]:
        raw = await CacheService.get(f"{PREFIX}{workflow_id}")
        if raw is None:
            return None
        return json.loads(raw)

    @classmethod
    async def list_all(cls, limit: int = 50) -> list:
        index = await cls._get_index()
        result = []
        for wf_id in reversed(index[-limit:]):
            wf = await cls.get(wf_id)
            if wf:
                result.append(wf)
        return result

    @classmethod
    async def _get_index(cls) -> list:
        raw = await CacheService.get(INDEX_KEY)
        if raw is None:
            return []
        return json.loads(raw)
