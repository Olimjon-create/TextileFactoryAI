"""Vercel serverless kirish nuqtasi: backend/app dagi FastAPI ilovasi.

vercel.json barcha /api/* so'rovlarini shu funksiyaga yo'naltiradi; FastAPI asl yo'lni (/api/v1/...) ko'radi.
Muhit o'zgaruvchilari (Vercel → Project → Settings → Environment Variables):
  DATABASE_URL          — Neon PostgreSQL (Vercel Storage → Neon ulanganda avtomatik qo'shiladi).
                          Bo'lmasa vaqtinchalik SQLite (/tmp) — sayt ishlaydi, lekin ma'lumotlar saqlanmaydi.
                          Supabase: "Transaction pooler" manzili (port 6543) + DB_NULL_POOL=true.
  SUPABASE_URL, SUPABASE_SECRET_KEY — berilsa yuklangan rasmlar Supabase Storage'da doimiy saqlanadi.
  JWT_SECRET_KEY        — bo'lmasa DATABASE_URL dan hosil qilinadi (u ham maxfiy).
  SUPERADMIN_EMAIL/PASSWORD — berilgandagina super admin yaratiladi (standart parol ochiq saytda ishlatilmaydi).
"""

import hashlib
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

env = os.environ
if not env.get("DATABASE_URL"):
    # Vercel'ning Neon/Postgres integratsiyalari turli nomlar bilan beradi
    for key in ("POSTGRES_URL", "NEON_DATABASE_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"):
        if env.get(key):
            env["DATABASE_URL"] = env[key]
            break
    else:
        env["DATABASE_URL"] = "sqlite:////tmp/textile_demo.db"

if not env.get("JWT_SECRET_KEY"):
    env["JWT_SECRET_KEY"] = hashlib.sha256(("tfai-jwt:" + env["DATABASE_URL"]).encode()).hexdigest()

env.setdefault("MEDIA_DIR", "/tmp/media")  # serverless'da faqat /tmp yoziladi (yuklangan rasmlar saqlanmaydi)
env.setdefault("SEED_PUBLIC_DEMO", "true")
env.setdefault("BOOTSTRAP_SUPERADMIN", "true" if env.get("SUPERADMIN_PASSWORD") else "false")
env.setdefault("RATE_LIMIT_BACKEND", "db")  # serverless nusxalar xotirani bo'lishmaydi — hisob bazada
env.setdefault("CORS_ORIGINS", "")  # frontend bilan bir domen — CORS kerak emas

from app.main import app, prepare  # noqa: E402

prepare()

__all__ = ["app"]
