from tests.conftest import ADMIN_EMAIL, API, add_user, auth, register_owner


def test_login_and_me(client):
    headers = auth(client, ADMIN_EMAIL)
    r = client.get(f"{API}/auth/me", headers=headers)
    assert r.status_code == 200
    assert r.json()["role"] == "SUPER_ADMIN"


def test_login_is_recorded_in_audit_log(client):
    owner, _ = register_owner(client, "owner@a.uz", "Alpha")
    auth(client, "owner@a.uz")
    client.post(f"{API}/auth/login", json={"email": "owner@a.uz", "password": "wrong-pass"})
    admin = auth(client, ADMIN_EMAIL)

    logs = client.get(f"{API}/audit-logs", headers=admin, params={"action": "LOGIN"}).json()["items"]
    # Faqat muvaffaqiyatli kirish yoziladi (noto'g'ri parol — yo'q)
    assert [l["changes"]["email"] for l in logs].count("owner@a.uz") == 1
    entry = next(l for l in logs if l["changes"]["email"] == "owner@a.uz")
    assert entry["entity"] == "session" and entry["user_name"] == "Owner"
    assert entry["changes"]["ip"] and entry["changes"]["qurilma"]
    # Zavod egasi faqat o'z zavodidagi kirishlarni ko'radi
    own = client.get(f"{API}/audit-logs", headers=owner, params={"action": "LOGIN"}).json()["items"]
    assert {l["changes"]["email"] for l in own} == {"owner@a.uz"}


def test_change_own_password(client):
    headers = auth(client, ADMIN_EMAIL)
    url = f"{API}/auth/change-password"
    assert client.post(url, json={"current_password": "secret12", "new_password": "NewPass123"}).status_code == 401
    r = client.post(url, headers=headers, json={"current_password": "wrong-pass", "new_password": "NewPass123"})
    assert r.status_code == 400 and "Joriy parol" in r.json()["detail"]
    assert client.post(url, headers=headers, json={"current_password": "secret12", "new_password": "short"}).status_code == 422
    r = client.post(url, headers=headers, json={"current_password": "secret12", "new_password": "secret12"})
    assert r.status_code == 400

    assert client.post(url, headers=headers, json={"current_password": "secret12", "new_password": "NewPass123"}).status_code == 204
    assert client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "secret12"}).status_code == 401
    new = auth(client, ADMIN_EMAIL, "NewPass123")
    logs = client.get(f"{API}/audit-logs", headers=new, params={"action": "PASSWORD"}).json()["items"]
    assert len(logs) == 1 and logs[0]["user_name"] == "Super Admin"


def test_backend_messages_follow_accept_language(client):
    owner, _ = register_owner(client, "owner@a.uz", "Alpha")
    body = {"code": "FAB-1", "name": "Pike", "material_type": "FABRIC", "unit": "METER"}
    assert client.post(f"{API}/inventory/materials", headers=owner, json=body).status_code == 201
    detail = lambda lang: client.post(  # noqa: E731
        f"{API}/inventory/materials", headers={**owner, "Accept-Language": lang}, json=body
    ).json()["detail"]
    assert detail("uz") == "'FAB-1' kodli material allaqachon mavjud"
    assert detail("ru") == "Материал с кодом 'FAB-1' уже существует"
    assert detail("en-US,en;q=0.9") == "A material with code 'FAB-1' already exists"
    assert detail("de") == "'FAB-1' kodli material allaqachon mavjud"  # noma'lum til — o'zbekcha


def test_wrong_password(client):
    r = client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pass"})
    assert r.status_code == 401


def test_role_hierarchy(client):
    owner, _ = register_owner(client, "owner@a.uz", "Alpha")
    # Egasi boshqa egani yarata olmaydi
    r = client.post(
        f"{API}/users",
        headers=owner,
        json={"full_name": "X Y", "email": "x@a.uz", "password": "secret12", "role": "FACTORY_OWNER"},
    )
    assert r.status_code == 403
    manager = add_user(client, owner, "m@a.uz", "MANAGER")
    add_user(client, manager, "w@a.uz", "WORKER")
    worker = auth(client, "w@a.uz")
    assert client.get(f"{API}/users", headers=worker).status_code == 403


def test_factory_isolation(client):
    owner_a, _ = register_owner(client, "a@a.uz", "Alpha")
    register_owner(client, "b@b.uz", "Beta")
    assert len(client.get(f"{API}/users", headers=owner_a).json()) == 1
    assert len(client.get(f"{API}/factories", headers=owner_a).json()) == 1
    admin = auth(client, ADMIN_EMAIL)
    assert len(client.get(f"{API}/factories", headers=admin).json()) == 2


def test_inactive_factory_blocks_access(client):
    owner, factory_id = register_owner(client, "a@a.uz", "Alpha")
    admin = auth(client, ADMIN_EMAIL)
    r = client.patch(f"{API}/factories/{factory_id}", headers=admin, json={"is_active": False})
    assert r.status_code == 200
    assert client.get(f"{API}/auth/me", headers=owner).status_code == 403
