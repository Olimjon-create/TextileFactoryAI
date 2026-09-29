"""Testlar alohida SQLite bazasida ishlaydi — PostgreSQL'dagi haqiqiy ma'lumotlarga tegmaydi."""

import os
import tempfile

_db_file = os.path.join(tempfile.gettempdir(), "textile_factory_ai_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_file}"
os.environ["AUTO_MIGRATE"] = "false"
os.environ["MEDIA_DIR"] = os.path.join(tempfile.gettempdir(), "tfai_test_media")
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SECRET_KEY"] = ""
os.environ["TELEGRAM_BOT_TOKEN"] = ""
os.environ["RESEND_API_KEY"] = ""
os.environ["APP_URL"] = ""
os.environ["TELEGRAM_ADMIN_CHAT_ID"] = ""
os.environ["CRON_SECRET"] = ""
os.environ["PAYMENT_PROVIDER"] = "demo"
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["SELF_REGISTRATION_ENABLED"] = "true"

import pytest
from fastapi.testclient import TestClient

import app.models
from app.core.database import Base, SessionLocal, engine
from app.core.roles import Role
from app.core.security import hash_password
from app.main import app
from app.models import User

API = "/api/v1"
ADMIN_EMAIL = "admin@test.uz"
PASSWORD = "secret12"


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        db.add(
            User(
                email=ADMIN_EMAIL,
                full_name="Super Admin",
                hashed_password=hash_password(PASSWORD),
                role=Role.SUPER_ADMIN,
            )
        )
        db.commit()
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


def auth(client: TestClient, email: str, password: str = PASSWORD) -> dict[str, str]:
    r = client.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def register_owner(client: TestClient, email: str, factory: str) -> tuple[dict[str, str], int]:
    r = client.post(
        f"{API}/auth/register",
        json={"full_name": "Owner", "email": email, "password": PASSWORD, "factory_name": factory},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    return {"Authorization": f"Bearer {body['access_token']}"}, body["user"]["factory_id"]


def add_user(client: TestClient, headers: dict[str, str], email: str, role: str) -> dict[str, str]:
    r = client.post(
        f"{API}/users",
        headers=headers,
        json={"full_name": "Xodim", "email": email, "password": PASSWORD, "role": role},
    )
    assert r.status_code == 201, r.text
    return auth(client, email)
