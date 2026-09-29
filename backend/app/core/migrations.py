from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from app.core.database import engine

BACKEND_DIR = Path(__file__).resolve().parents[2]
BASELINE_REVISION = "0001_baseline"


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return cfg


def run_migrations() -> None:
    """Bazani eng oxirgi migratsiyagacha yangilaydi (`alembic upgrade head`).

    Alembic joriy qilinishidan oldin create_all bilan yaratilgan bazalarda `alembic_version`
    jadvali bo'lmaydi — ularning sxemasi baseline bilan bir xil, shuning uchun avval
    baseline'ga stamp qilinadi, keyin yangi migratsiyalar qo'llanadi. Ma'lumotlar saqlanadi.
    """
    cfg = alembic_config()
    with engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(724001)"))
        cfg.attributes["connection"] = connection
        tables = set(inspect(connection).get_table_names())
        if "alembic_version" not in tables and "users" in tables:
            command.stamp(cfg, BASELINE_REVISION)
        command.upgrade(cfg, "head")
        if connection.dialect.name == "postgresql":
            lock_supabase_data_api(connection)


def lock_supabase_data_api(connection) -> None:
    """Supabase'da `public` jadvallari Data API (anon/authenticated kalit) orqali ochiq bo'ladi.

    Barcha ma'lumotlar faqat backend orqali o'tadi, shuning uchun har bir jadvalda RLS yoqiladi va
    siyosat (policy) qo'shilmaydi — Data API hech narsa ko'rmaydi. Backend jadvallar egasi (postgres)
    sifatida ulanadi, egaga RLS ta'sir qilmaydi. Oddiy PostgreSQL'da (anon roli yo'q) hech narsa qilinmaydi.
    Har migratsiyadan keyin chaqiriladi — keyin qo'shilgan jadvallar ham yopiladi.
    """
    if connection.execute(text("SELECT 1 FROM pg_roles WHERE rolname = 'anon'")).first() is None:
        return
    unlocked = connection.execute(
        text(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity"
        )
    ).scalars().all()
    for table in unlocked:
        connection.execute(text(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY'))
