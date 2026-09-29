"""Zavod egalarini super admin yaratadi: ochiq ro'yxatdan o'tish yopiq, ega berilgan login/parol bilan kiradi."""

from app.core.config import settings
from tests.conftest import ADMIN_EMAIL, API, auth


def test_registration_closed_and_owner_created_by_admin(client, monkeypatch):
    monkeypatch.setattr(settings, "SELF_REGISTRATION_ENABLED", False)
    body = {"full_name": "Begona", "email": "self@x.uz", "password": "secret12", "factory_name": "Begona zavod"}
    r = client.post(f"{API}/auth/register", json=body)
    assert r.status_code == 403 and "administrator" in r.json()["detail"]
    assert client.get(f"{API}/auth/config").json()["registration_enabled"] is False

    admin = auth(client, ADMIN_EMAIL)
    r = client.post(f"{API}/users", headers=admin, json={
        "full_name": "Akmal Karimov", "email": "Akmal@Baraka.uz", "password": "Baraka-2026", "phone": "+998901112233",
        "role": "FACTORY_OWNER", "factory_name": "Baraka Tekstil",
    })
    assert r.status_code == 201, r.text
    owner = r.json()
    assert owner["role"] == "FACTORY_OWNER" and owner["factory"]["name"] == "Baraka Tekstil"

    # Ega shu login (email) va parol bilan kiradi va o'z fabrikasini boshqaradi
    login = client.post(f"{API}/auth/login", json={"email": "akmal@baraka.uz", "password": "Baraka-2026"})
    assert login.status_code == 200
    h = {"Authorization": f"Bearer {login.json()['access_token']}"}
    me = client.get(f"{API}/auth/me", headers=h).json()
    assert me["factory"]["name"] == "Baraka Tekstil"
    assert client.post(f"{API}/users", headers=h, json={"full_name": "Xodim Bir", "email": "x1@baraka.uz", "password": "secret12", "role": "MANAGER"}).status_code == 201
    assert client.post(f"{API}/auth/login", json={"email": "akmal@baraka.uz", "password": "noto'g'ri"}).status_code == 401

    # Band email bilan — fabrika ham yaratilmaydi; yangi fabrikani faqat super admin ochadi
    factories_before = len(client.get(f"{API}/factories", headers=admin).json())
    r = client.post(f"{API}/users", headers=admin, json={"full_name": "Ikkinchi", "email": "akmal@baraka.uz", "password": "secret12",
                                                         "role": "FACTORY_OWNER", "factory_name": "Takror"})
    assert r.status_code == 409 and len(client.get(f"{API}/factories", headers=admin).json()) == factories_before
    r = client.post(f"{API}/users", headers=h, json={"full_name": "Hiyla", "email": "h@x.uz", "password": "secret12", "role": "MANAGER", "factory_name": "Hiyla"})
    assert r.status_code == 403
