"""Birinchi SUPER_ADMIN foydalanuvchisini yaratadi.

Backend ishga tushganda bu avtomatik bajariladi; skript faqat qo'lda ishlatish uchun.
Ishlatish (backend papkasida):  python -m scripts.create_superadmin
Ma'lumotlar .env faylidagi SUPERADMIN_* qiymatlardan olinadi.
"""

from app.core.config import settings
from app.core.migrations import run_migrations
from app.services.bootstrap import ensure_superadmin


def main() -> None:
    run_migrations()
    if ensure_superadmin():
        print(f"SUPER_ADMIN yaratildi: {settings.SUPERADMIN_EMAIL}")
    else:
        print("SUPER_ADMIN allaqachon mavjud")


if __name__ == "__main__":
    main()
