from collections.abc import Generator
from datetime import datetime

from sqlalchemy import DateTime, create_engine, event, func
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.core.config import settings

def _engine_options() -> dict:
    options: dict = {"pool_pre_ping": True}
    if settings.DATABASE_URL.startswith("sqlite"):
        return options
    if "pooler.supabase.com" in settings.DATABASE_URL:
        # Supabase pooler (Supavisor) transaction rejimi prepared statement'larni qo'llamaydi —
        # psycopg ularni avtomatik yaratmasin (session rejimida ham zarari yo'q)
        options["connect_args"] = {"prepare_threshold": None}
    if settings.DB_NULL_POOL:
        # Serverless (Vercel): har instansiya o'z pulini ushlab turmasin — PgBouncer/Neon pooler ishlatiladi
        from sqlalchemy.pool import NullPool

        options["poolclass"] = NullPool
    else:
        options.update(pool_size=settings.DB_POOL_SIZE, max_overflow=settings.DB_MAX_OVERFLOW, pool_recycle=1800)
    return options


engine = create_engine(settings.DATABASE_URL, **_engine_options())

if engine.dialect.name == "sqlite":
    # SQLite (faqat lokal ishlab chiqish/testlar uchun) FK va ON DELETE CASCADE'ni
    # sukut bo'yicha o'chirib qo'yadi — PostgreSQL bilan bir xil ishlashi uchun yoqamiz.
    @event.listens_for(engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
