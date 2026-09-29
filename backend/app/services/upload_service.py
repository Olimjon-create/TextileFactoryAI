"""Rasm yuklash (zavod logosi/muqovasi, mahsulot rasmi).

Fayllar tasodifiy nom bilan saqlanadi: Supabase sozlangan bo'lsa (SUPABASE_URL + SUPABASE_SECRET_KEY)
ochiq bucket'ga yuklanib to'liq https manzil qaytadi, aks holda MEDIA_DIR ga yoziladi va /media/<nom> orqali beriladi.
Fayl turi kengaytmaga emas, fayl ichidagi "magic bytes" ga qarab aniqlanadi.
"""

import secrets
from pathlib import Path

import requests
from fastapi import HTTPException, UploadFile, status
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.i18n import t

BACKEND_DIR = Path(__file__).resolve().parents[2]

_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
]

CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "svg": "image/svg+xml",
}


def upload_to_supabase(name: str, data: bytes, content_type: str) -> str:
    """Faylni Supabase Storage bucket'iga yuklaydi va ochiq (public) manzilini qaytaradi."""
    base = settings.SUPABASE_URL.strip().rstrip("/")
    bucket = settings.SUPABASE_STORAGE_BUCKET
    key = settings.SUPABASE_SECRET_KEY.strip()
    response = requests.post(
        f"{base}/storage/v1/object/{bucket}/{name}",
        data=data,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        },
        timeout=30,
    )
    if response.status_code >= 300:
        raise RuntimeError(f"Supabase Storage xatosi ({response.status_code}): {response.text[:300]}")
    return f"{base}/storage/v1/object/public/{bucket}/{name}"


def media_dir() -> Path:
    path = Path(settings.MEDIA_DIR)
    if not path.is_absolute():
        path = BACKEND_DIR / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def _detect_extension(head: bytes) -> str | None:
    for signature, ext in _SIGNATURES:
        if head.startswith(signature):
            return ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


async def save_image(file: UploadFile) -> str:
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            t("Rasm hajmi {mb} MB dan oshmasligi kerak", mb=settings.MAX_UPLOAD_MB),
        )
    ext = _detect_extension(data[:16])
    if ext is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Faqat JPG, PNG yoki WEBP rasm yuklash mumkin"
        )
    name = f"{secrets.token_hex(16)}.{ext}"
    if settings.supabase_storage_enabled:
        try:
            return await run_in_threadpool(upload_to_supabase, name, data, CONTENT_TYPES[ext])
        except (requests.RequestException, RuntimeError) as exc:
            print(exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Rasmni saqlab bo'lmadi, keyinroq urinib ko'ring")
    (media_dir() / name).write_bytes(data)
    return f"/media/{name}"
