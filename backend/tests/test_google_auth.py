import pytest

from app.core.config import settings
from app.services import google_auth
from tests.conftest import API, add_user, register_owner

CLIENT_ID = "test-client-id.apps.googleusercontent.com"
CREDENTIAL = "x" * 40


@pytest.fixture()
def google(monkeypatch):
    """Google tokenni tekshirishni soxtalashtiradi; claims ni test o'zi beradi."""
    claims: dict = {}

    def fake_verify(token, request, audience):
        assert token == CREDENTIAL
        assert audience == CLIENT_ID
        if claims.get("invalid"):
            raise ValueError("bad token")
        return claims

    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", CLIENT_ID)
    monkeypatch.setattr(google_auth.id_token, "verify_oauth2_token", fake_verify)
    return claims


def google_login(client):
    return client.post(f"{API}/auth/google", json={"credential": CREDENTIAL})


def test_config_exposes_client_id(client, google):
    assert client.get(f"{API}/auth/config").json()["google_client_id"] == CLIENT_ID


def test_config_when_disabled(client):
    assert client.get(f"{API}/auth/config").json()["google_client_id"] is None
    assert google_login(client).status_code == 503


def test_new_google_user_gets_own_factory(client, google):
    google.update(sub="1", email="Aziz@Gmail.com", email_verified=True, name="Aziz Karimov")
    r = google_login(client)
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    assert user["email"] == "aziz@gmail.com"
    assert user["role"] == "FACTORY_OWNER"
    assert user["factory"]["name"] == "Aziz Karimov fabrikasi"
    again = google_login(client).json()["user"]
    assert again["id"] == user["id"]
    assert again["factory_id"] == user["factory_id"]


def test_unknown_google_user_rejected_when_registration_closed(client, google, monkeypatch):
    monkeypatch.setattr(settings, "SELF_REGISTRATION_ENABLED", False)
    google.update(sub="9", email="new@gmail.com", email_verified=True, name="Yangi")
    r = google_login(client)
    assert r.status_code == 403 and "administrator" in r.json()["detail"]


def test_existing_employee_logs_in_with_google(client, google):
    owner, factory_id = register_owner(client, "owner@a.uz", "Alpha")
    add_user(client, owner, "worker@gmail.com", "WORKER")
    google.update(sub="2", email="worker@gmail.com", email_verified=True, name="Ishchi")
    user = google_login(client).json()["user"]
    assert user["role"] == "WORKER"
    assert user["factory_id"] == factory_id


def test_unverified_email_rejected(client, google):
    google.update(sub="3", email="x@gmail.com", email_verified=False)
    assert google_login(client).status_code == 401


def test_invalid_token_rejected(client, google):
    google.update(invalid=True)
    assert google_login(client).status_code == 401


def test_blocked_user_rejected(client, google):
    owner, _ = register_owner(client, "owner@a.uz", "Alpha")
    add_user(client, owner, "w@gmail.com", "WORKER")
    users = client.get(f"{API}/users", headers=owner).json()
    worker_id = next(u["id"] for u in users if u["email"] == "w@gmail.com")
    client.patch(f"{API}/users/{worker_id}", headers=owner, json={"is_active": False})
    google.update(sub="4", email="w@gmail.com", email_verified=True, name="W")
    assert google_login(client).status_code == 403
