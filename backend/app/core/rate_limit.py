"""So'rovlar chastotasini cheklash: parol tanlash (brute-force), ro'yxatdan o'tish va ochiq katalog spamiga qarshi.

RATE_LIMIT_BACKEND=memory — jarayon xotirasida (bitta server uchun yetarli);
RATE_LIMIT_BACKEND=db — bazadagi rate_limit_hits jadvalida (serverless/Vercel: barcha nusxalar uchun umumiy).
"""

import random
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status
from sqlalchemy import text

from app.core.config import settings

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    if settings.TRUST_PROXY_HEADERS:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _too_many(retry: int) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"Juda ko'p urinish. {retry} soniyadan keyin qayta urinib ko'ring",
        headers={"Retry-After": str(retry)},
    )


def _hit_db(key: str, limit: int, window_seconds: int) -> None:
    """Bazadagi hisoblagich (qat'iy oyna): serverless'ning barcha nusxalari bitta hisobni ko'radi."""
    from app.core.database import engine

    now = int(time.time())
    window = now - now % window_seconds
    with engine.begin() as conn:
        hits = conn.execute(
            text(
                "INSERT INTO rate_limit_hits (key, window_start, hits) VALUES (:k, :w, 1) "
                "ON CONFLICT (key) DO UPDATE SET "
                "hits = CASE WHEN rate_limit_hits.window_start = excluded.window_start THEN rate_limit_hits.hits + 1 ELSE 1 END, "
                "window_start = excluded.window_start "
                "RETURNING hits"
            ),
            {"k": key[:200], "w": window},
        ).scalar_one()
        if random.random() < 0.01:
            conn.execute(text("DELETE FROM rate_limit_hits WHERE window_start < :old"), {"old": now - 86_400})
    if hits > limit:
        raise _too_many(window + window_seconds - now)


def hit(key: str, limit: int, window_seconds: int) -> None:
    """`key` bo'yicha oxirgi `window_seconds` ichida `limit` dan ko'p urinish bo'lsa — 429."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    if settings.RATE_LIMIT_BACKEND == "db":
        _hit_db(key, limit, window_seconds)
        return
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        while bucket and bucket[0] <= now - window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            raise _too_many(int(bucket[0] + window_seconds - now) + 1)
        bucket.append(now)
        if len(_hits) > 50_000:
            for k in [k for k, v in _hits.items() if not v or v[-1] <= now - 3600]:
                del _hits[k]


def reset() -> None:
    with _lock:
        _hits.clear()


def by_ip(scope: str, limit: int, window_seconds: int):
    """Endpoint dependency: IP bo'yicha cheklov."""

    def dependency(request: Request) -> None:
        hit(f"{scope}:{client_ip(request)}", limit, window_seconds)

    return dependency
