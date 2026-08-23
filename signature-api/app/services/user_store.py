"""Stockage des utilisateurs dans Redis."""
import json
from typing import Optional
from app.services.cache import CacheService

PREFIX = "user:"
INDEX_KEY = "users:index"


class UserStore:

    @classmethod
    async def save(cls, user_id: str, data: dict):
        serialized = json.dumps(data, ensure_ascii=False).encode()
        await CacheService.set(f"{PREFIX}{user_id}", serialized, ttl=86400 * 365)
        index = await cls._get_index()
        if user_id not in index:
            index.append(user_id)
        await CacheService.set(INDEX_KEY, json.dumps(index).encode(), ttl=86400 * 365)

    @classmethod
    async def get(cls, user_id: str) -> Optional[dict]:
        raw = await CacheService.get(f"{PREFIX}{user_id}")
        if raw is None:
            return None
        return json.loads(raw)

    @classmethod
    async def list_all(cls) -> list:
        index = await cls._get_index()
        result = []
        for uid in reversed(index):
            u = await cls.get(uid)
            if u:
                result.append(u)
        return result

    @classmethod
    async def _get_index(cls) -> list:
        raw = await CacheService.get(INDEX_KEY)
        if raw is None:
            return []
        return json.loads(raw)
