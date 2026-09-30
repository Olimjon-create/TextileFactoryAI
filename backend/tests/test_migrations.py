"""Alembic migratsiyalari modellar bilan bir xil sxema yaratishini tekshiradi."""

import os
import tempfile

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, event, inspect, text

import app.core.migrations as migrations
from app.core.database import Base


@pytest.fixture()
def fresh_engine(monkeypatch):
    path = os.path.join(tempfile.gettempdir(), "tfai_migrations_test.db")
    if os.path.exists(path):
        os.remove(path)
    engine = create_engine(f"sqlite:///{path}")
    event.listen(engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
    monkeypatch.setattr(migrations, "engine", engine)
    yield engine
    engine.dispose()
    os.remove(path)


def _head() -> str:
    return ScriptDirectory.from_config(migrations.alembic_config()).get_current_head()


def _diff(engine):
    with engine.connect() as conn:
        ctx = MigrationContext.configure(conn, opts={"compare_type": True})
        return compare_metadata(ctx, Base.metadata)


def _alembic(engine, fn, revision):
    cfg = migrations.alembic_config()
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        fn(cfg, revision)


def test_upgrade_head_matches_models(fresh_engine):
    migrations.run_migrations()
    assert _diff(fresh_engine) == []
    with fresh_engine.connect() as conn:
        assert conn.scalar(text("SELECT version_num FROM alembic_version")) == _head()


def test_legacy_database_is_stamped_and_upgraded(fresh_engine):
    """Alembic'dan oldingi (create_all) baza — sxemasi baseline bilan bir xil, alembic_version yo'q."""
    _alembic(fresh_engine, command.upgrade, migrations.BASELINE_REVISION)
    with fresh_engine.begin() as conn:
        conn.execute(text("DROP TABLE alembic_version"))
        conn.execute(text("INSERT INTO factories (id, name, is_active) VALUES (1, 'Eski', 1)"))
        conn.execute(
            text(
                "INSERT INTO users (email, full_name, hashed_password, role, is_active, factory_id) "
                "VALUES ('old@a.uz', 'Old', 'x', 'WORKER', 1, 1)"
            )
        )

    migrations.run_migrations()

    tables = inspect(fresh_engine).get_table_names()
    assert {"customers", "orders", "order_items"} <= set(tables)
    assert _diff(fresh_engine) == []
    with fresh_engine.connect() as conn:
        assert conn.scalar(text("SELECT email FROM users")) == "old@a.uz"
        assert conn.scalar(text("SELECT is_public FROM factories")) == 1


def test_downgrade_to_base_and_upgrade_again(fresh_engine):
    migrations.run_migrations()
    _alembic(fresh_engine, command.downgrade, "base")
    assert inspect(fresh_engine).get_table_names() == ["alembic_version"]
    migrations.run_migrations()
    assert _diff(fresh_engine) == []


def test_rerun_after_version_stamped_back(fresh_engine):
    """Versiya yozuvi eski kod uchun 0021 ga qaytarilgan, jadval/ustunlar esa joyida — upgrade yiqilmaydi."""
    migrations.run_migrations()
    _alembic(fresh_engine, command.stamp, "0021_employee_telegram_expenses")
    migrations.run_migrations()
    assert _diff(fresh_engine) == []
    with fresh_engine.connect() as conn:
        assert conn.scalar(text("SELECT version_num FROM alembic_version")) == _head()
