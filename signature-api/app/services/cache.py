"""Service de cache Redis — réponses OCSP et CRL."""
import redis.asyncio as aioredis
import structlog

from app.config import settings

log = structlog.get_logger()
_redis: aioredis.Redis | None = None


class CacheService:

    @classmethod
    async def connect(cls):
        global _redis
        _redis = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=False,
        )
        log.info("cache.connected", url=settings.REDIS_URL)

    @classmethod
    async def disconnect(cls):
        if _redis:
            await _redis.aclose()

    @classmethod
    async def get(cls, key: str) -> bytes | None:
        if _redis is None:
            return None
        return await _redis.get(key)

    @classmethod
    async def set(cls, key: str, value: bytes, ttl: int = 3600):
        if _redis is None:
            return
        await _redis.set(key, value, ex=ttl)

    @classmethod
    async def delete(cls, key: str):
        if _redis:
            await _redis.delete(key)

    @classmethod
    async def exists(cls, key: str) -> bool:
        if _redis is None:
            return False
        return bool(await _redis.exists(key))
