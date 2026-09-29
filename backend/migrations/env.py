from alembic import context

import app.models  # noqa: F401  (barcha modellar metadata'ga ro'yxatdan o'tishi uchun)
from app.core.database import Base, engine

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """`alembic upgrade head --sql` — SQL skriptni bazaga ulanmasdan chiqarish."""
    context.configure(
        url=engine.url.render_as_string(hide_password=False),
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=engine.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # app.core.migrations dasturiy chaqirganda tayyor ulanishni uzatadi
    connection = context.config.attributes.get("connection")
    if connection is not None:
        _run(connection)
        return
    with engine.connect() as conn:
        _run(conn)
        conn.commit()


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        # SQLite ALTER TABLE'ni cheklangan qo'llaydi — batch rejimi jadvalni qayta quradi
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
