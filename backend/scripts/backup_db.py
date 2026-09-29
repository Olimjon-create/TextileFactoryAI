"""Bazaning (Supabase yoki boshqa) to'liq zaxira nusxasi — backend/backups/ ga SQLite fayl ko'rinishida.

Ishlatish (backend papkasida):  venv\\Scripts\\python -m scripts.backup_db
Yoki loyiha papkasida:          zaxira-olish.bat

Fayl oddiy SQLite baza: uni lokal DATABASE_URL sifatida ochish yoki Supabase'ga qaytarish mumkin:
    venv\\Scripts\\python -m scripts.migrate_to_supabase --source sqlite:///./backups/<fayl>.db --replace
Rasmlar Supabase Storage'da qoladi (bazada faqat ularning manzillari saqlanadi).
"""

from datetime import datetime
from pathlib import Path

import app.models
from app.core.database import engine
from app.services.backup_service import KEEP, snapshot

BACKUP_DIR = Path(__file__).resolve().parents[1] / "backups"


def main() -> None:
    BACKUP_DIR.mkdir(exist_ok=True)
    path = BACKUP_DIR / f"textilecore-{datetime.now():%Y%m%d-%H%M}.db"
    print(f"Manba: {engine.url.render_as_string(hide_password=True)}")
    total = snapshot(engine, path)
    print(f"Tayyor: {total} ta qator → {path} ({path.stat().st_size / 1024:.0f} KB)")
    old = sorted(BACKUP_DIR.glob("textilecore-*.db"))[:-KEEP]
    for f in old:
        f.unlink(missing_ok=True)
    if old:
        print(f"Eski {len(old)} ta nusxa o'chirildi (oxirgi {KEEP} tasi saqlanadi)")


if __name__ == "__main__":
    main()
