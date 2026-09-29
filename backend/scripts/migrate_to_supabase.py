"""Lokal bazadagi (SQLite) barcha ma'lumotlarni .env dagi DATABASE_URL bazasiga (Supabase) ko'chiradi.

Ishlatish (backend papkasida, .env da Supabase DATABASE_URL yozilgandan keyin):
    venv\\Scripts\\python -m scripts.migrate_to_supabase
    venv\\Scripts\\python -m scripts.migrate_to_supabase --source sqlite:///./boshqa.db --replace

Nima qiladi:
  1. Maqsad bazada jadvallarni yaratadi (Alembic migratsiyalari) va Supabase'da RLS'ni yoqadi.
  2. Jadvallarni tartib bilan (avval bog'lanadigan jadvallar) ko'chiradi, id'lar saqlanadi.
  3. PostgreSQL ketma-ketliklarini (id sequence) eng katta id'ga tenglaydi.
  4. SUPABASE_URL va SUPABASE_SECRET_KEY berilgan bo'lsa, bazada ko'rsatilgan /media/... rasmlarni
     Supabase Storage'ga yuklaydi va manzillarni yangilaydi. frontend/public/media dagi rasmlar
     frontend bilan birga tarqatiladi — ularga tegilmaydi.
Manba bazaga faqat o'qish uchun ulanadi — u o'zgarmaydi.
"""

import argparse
from pathlib import Path

from sqlalchemy import create_engine, func, select, text

import app.models
from app.core.config import settings
from app.core.database import Base, engine
from app.core.migrations import run_migrations
from app.services.upload_service import CONTENT_TYPES, media_dir, upload_to_supabase

FRONTEND_PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "public"
BATCH = 500


def _media_uploader():
    """/media/... manzilini Supabase Storage manziliga almashtiradigan funksiya (bir fayl bir marta yuklanadi)."""
    uploaded: dict[str, str] = {}
    local_root = media_dir()

    def convert(value):
        if not isinstance(value, str) or not value.startswith("/media/"):
            return value
        if value in uploaded:
            return uploaded[value]
        rel = value.removeprefix("/media/")
        local = local_root / rel
        ext = local.suffix.lstrip(".").lower()
        if (FRONTEND_PUBLIC / "media" / rel).is_file() or not local.is_file() or ext not in CONTENT_TYPES:
            uploaded[value] = value
        else:
            uploaded[value] = upload_to_supabase(rel, local.read_bytes(), CONTENT_TYPES[ext])
            print(f"  rasm yuklandi: {value}")
        return uploaded[value]

    return convert


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default="sqlite:///./textile_dev.db", help="manba baza (standart: textile_dev.db)")
    parser.add_argument("--replace", action="store_true", help="maqsad bazadagi mavjud ma'lumotlarni o'chirib, qaytadan ko'chirish")
    args = parser.parse_args()

    source = create_engine(args.source)
    if source.url.render_as_string(hide_password=False) == engine.url.render_as_string(hide_password=False):
        raise SystemExit("Manba va maqsad bir xil baza. backend\\.env dagi DATABASE_URL ni Supabase manziliga o'zgartiring.")
    print(f"Manba:  {source.url}")
    print(f"Maqsad: {engine.url.render_as_string(hide_password=True)}")

    print("Jadvallar yaratilmoqda (migratsiyalar)...")
    run_migrations()

    tables = Base.metadata.sorted_tables
    convert_media = _media_uploader() if settings.supabase_storage_enabled else None
    if convert_media is None:
        print("SUPABASE_URL/SUPABASE_SECRET_KEY yo'q — rasmlar ko'chirilmaydi (manzillar o'zgarishsiz qoladi).")

    with engine.begin() as target, source.connect() as src:
        existing = sum(target.execute(select(func.count()).select_from(t)).scalar_one() for t in tables)
        if existing and not args.replace:
            raise SystemExit(
                f"Maqsad bazada allaqachon {existing} ta qator bor. Ustidan yozish uchun --replace bilan ishga tushiring."
            )
        if existing:
            print(f"Maqsad bazadagi {existing} ta qator o'chirilmoqda (--replace)...")
            for table in reversed(tables):
                target.execute(table.delete())

        total = 0
        for table in tables:
            url_columns = [c.name for c in table.columns if c.name.endswith("_url")]
            rows = [dict(r._mapping) for r in src.execute(select(table))]
            if not rows:
                continue
            if convert_media and url_columns:
                for row in rows:
                    for col in url_columns:
                        row[col] = convert_media(row[col])
            for i in range(0, len(rows), BATCH):
                target.execute(table.insert(), rows[i : i + BATCH])
            total += len(rows)
            print(f"  {table.name}: {len(rows)}")

        if target.dialect.name == "postgresql":
            for table in tables:
                if "id" in table.columns:
                    target.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('\"{table.name}\"', 'id'), "
                            f'COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM "{table.name}"'
                        )
                    )
    print(f"Tayyor: {total} ta qator ko'chirildi.")


if __name__ == "__main__":
    main()
