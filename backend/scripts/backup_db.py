"""Bazaning (Supabase yoki boshqa) to'liq zaxira nusxasi — backend/backups/ ga SQLite fayl ko'rinishida.

Ishlatish (backend papkasida):  venv\\Scripts\\python -m scripts.backup_db
Yoki loyiha papkasida:          zaxira-olish.bat

Fayl oddiy SQLite baza: uni lokal DATABASE_URL sifatida ochish yoki Supabase'ga qaytarish mumkin:
    venv\\Scripts\\python -m scripts.migrate_to_supabase --source sqlite:///./backups/<fayl>.db --replace
Rasmlar Supabase Storage'da qoladi (bazada faqat ularning manzillari saqlanadi).
"""

from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, inspect, select, text

import app.models
from app.core.database import Base, engine

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"
BATCH = 500
KEEP = 14


def main() -> None:
    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"textilecore-{datetime.now():%Y%m%d-%H%M}.db"
    target = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(target)
    print(f"Manba: {engine.url.render_as_string(hide_password=True)}")

    total = 0
    with engine.connect() as src, target.begin() as dst:
        existing = set(inspect(src).get_table_names())
        for table in Base.metadata.sorted_tables:
            if table.name not in existing or table.name == "rate_limit_hits":
                continue
            rows = [dict(r._mapping) for r in src.execute(select(table))]
            for i in range(0, len(rows), BATCH):
                dst.execute(table.insert(), rows[i : i + BATCH])
            total += len(rows)
            if rows:
                print(f"  {table.name}: {len(rows)}")
        version = src.execute(text("SELECT version_num FROM alembic_version")).scalar()
        dst.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
        dst.execute(text("INSERT INTO alembic_version VALUES (:v)"), {"v": version})
    target.dispose()
    print(f"Tayyor: {total} ta qator → {path} ({path.stat().st_size / 1024:.0f} KB)")
    old = sorted(BACKUP_DIR.glob("textilecore-*.db"))[:-KEEP]
    for f in old:
        f.unlink(missing_ok=True)
    if old:
        print(f"Eski {len(old)} ta nusxa o'chirildi (oxirgi {KEEP} tasi saqlanadi)")


if __name__ == "__main__":
    main()
