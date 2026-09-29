"""scripts/migrate_to_supabase: lokal SQLite -> maqsad baza (testda boshqa SQLite fayl)."""

import sys

import pytest
from sqlalchemy import create_engine, select

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.roles import Role
from app.core.security import hash_password
from app.models import Factory, User
from app.services.upload_service import media_dir
from scripts import migrate_to_supabase as script


@pytest.fixture()
def source(tmp_path, monkeypatch):
    src = create_engine(f"sqlite:///{tmp_path / 'src.db'}")
    Base.metadata.create_all(src)
    with src.begin() as conn:
        conn.execute(Factory.__table__.insert(), [
            {"id": 7, "name": "Alpha", "logo_url": "/media/tfai-test-logo.png", "cover_url": "https://x.uz/c.jpg"},
        ])
        conn.execute(User.__table__.insert(), [
            {"id": 3, "email": "o@a.uz", "full_name": "Owner", "hashed_password": hash_password("secret12"),
             "role": Role.FACTORY_OWNER, "factory_id": 7},
        ])
    (media_dir() / "tfai-test-logo.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    Base.metadata.drop_all(engine)
    monkeypatch.setattr(script, "run_migrations", lambda: Base.metadata.create_all(engine))
    yield f"sqlite:///{tmp_path / 'src.db'}"
    src.dispose()
    Base.metadata.drop_all(engine)


def run(monkeypatch, *args):
    monkeypatch.setattr(sys, "argv", ["migrate_to_supabase", *args])
    script.main()


def test_copies_rows_and_uploads_media(source, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://abc.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "sb_secret_test")
    uploads = []

    def fake_upload(name, data, content_type):
        uploads.append((name, content_type))
        return f"https://abc.supabase.co/storage/v1/object/public/media/{name}"

    monkeypatch.setattr(script, "upload_to_supabase", fake_upload)
    run(monkeypatch, "--source", source)

    assert uploads == [("tfai-test-logo.png", "image/png")]
    with SessionLocal() as db:
        factory = db.get(Factory, 7)
        assert factory.logo_url == "https://abc.supabase.co/storage/v1/object/public/media/tfai-test-logo.png"
        assert factory.cover_url == "https://x.uz/c.jpg"
        assert db.scalars(select(User.email)).all() == ["o@a.uz"]


def test_refuses_to_duplicate_without_replace(source, monkeypatch):
    run(monkeypatch, "--source", source)
    with pytest.raises(SystemExit):
        run(monkeypatch, "--source", source)
    run(monkeypatch, "--source", source, "--replace")
    with SessionLocal() as db:
        assert db.get(Factory, 7).logo_url == "/media/tfai-test-logo.png"  # Supabase sozlanmagan — o'zgarmaydi
        assert len(db.scalars(select(User)).all()) == 1
