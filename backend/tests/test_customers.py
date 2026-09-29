import pytest

from tests.conftest import ADMIN_EMAIL, API, add_user, auth, register_owner

CUSTOMER = {
    "name": "  Zara Uzbekistan LLC ",
    "customer_type": "COMPANY",
    "status": "ACTIVE",
    "contact_person": "Dilshod Rahimov",
    "phone": "+998 90 123-45-67",
    "email": "Buyer@Zara.uz",
    "country": "uz",
    "address": "Toshkent, Chilonzor 5",
    "notes": "Yillik shartnoma",
}


@pytest.fixture()
def owner(client):
    headers, _ = register_owner(client, "owner@a.uz", "Alpha")
    return headers


def create(client, headers, **overrides):
    r = client.post(f"{API}/customers", headers=headers, json={**CUSTOMER, **overrides})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_normalizes_and_autocodes(client, owner):
    c = create(client, owner)
    assert c["name"] == "Zara Uzbekistan LLC"
    assert c["customer_code"] == "CUS-00001"
    assert c["country"] == "UZ"
    assert c["factory"]["name"] == "Alpha"
    assert create(client, owner, name="Ikkinchi")["customer_code"] == "CUS-00002"
    # Qo'lda berilgan kod katta harfga o'tadi va avtomatik raqamlashga ta'sir qilmaydi
    assert create(client, owner, name="Uchinchi", customer_code="vip-1")["customer_code"] == "VIP-1"
    assert create(client, owner, name="To'rtinchi")["customer_code"] == "CUS-00003"


def test_minimal_customer(client, owner):
    c = create(client, owner, customer_type="INDIVIDUAL", contact_person="", phone=None, email="", country="", address=None, notes=None)
    assert c["email"] is None and c["country"] is None and c["contact_person"] is None


@pytest.mark.parametrize(
    "bad",
    [
        {"name": "A"},
        {"name": "   "},
        {"email": "not-an-email"},
        {"phone": "abc"},
        {"country": "UZB"},
        {"country": "1Z"},
        {"customer_code": "bad code"},
        {"status": "VIP"},
        {"customer_type": "GOV"},
    ],
)
def test_validation(client, owner, bad):
    r = client.post(f"{API}/customers", headers=owner, json={**CUSTOMER, **bad})
    assert r.status_code == 422, r.text


def test_duplicate_code(client, owner):
    create(client, owner, customer_code="C-1")
    r = client.post(f"{API}/customers", headers=owner, json={**CUSTOMER, "customer_code": "c-1"})
    assert r.status_code == 409
    other, _ = register_owner(client, "b@b.uz", "Beta")
    create(client, other, customer_code="C-1")  # boshqa fabrikada ruxsat


def test_list_search_filters_pagination(client, owner):
    create(client, owner)
    create(client, owner, name="Ali Valiyev", customer_type="INDIVIDUAL", status="LEAD", country="KZ", email=None, contact_person=None)
    for i in range(5):
        create(client, owner, name=f"Mijoz {i}", status="INACTIVE", country="RU", email=f"m{i}@mail.ru", contact_person=None)

    def get(**params):
        r = client.get(f"{API}/customers", headers=owner, params=params)
        assert r.status_code == 200, r.text
        return r.json()

    assert get()["total"] == 7
    assert get(search="zara")["total"] == 1
    assert get(search="dilshod")["total"] == 1  # kontakt shaxs bo'yicha
    assert get(search="CUS-00002")["total"] == 1
    assert get(status="LEAD")["total"] == 1
    assert get(customer_type="INDIVIDUAL")["total"] == 1
    assert get(country="ru")["total"] == 5
    page = get(limit=3, offset=3)
    assert page["total"] == 7 and len(page["items"]) == 3
    assert client.get(f"{API}/customers/countries", headers=owner).json() == ["KZ", "RU", "UZ"]
    stats = client.get(f"{API}/customers/stats", headers=owner).json()
    assert stats == {"total": 7, "by_status": {"LEAD": 1, "ACTIVE": 1, "INACTIVE": 5}}


def test_update_and_delete(client, owner):
    c = create(client, owner)
    url = f"{API}/customers/{c['id']}"
    r = client.patch(url, headers=owner, json={"status": "INACTIVE", "email": "", "notes": None, "name": None})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "INACTIVE"
    assert body["email"] is None and body["notes"] is None
    assert body["name"] == "Zara Uzbekistan LLC"  # majburiy maydon None bilan o'chmaydi
    assert client.patch(url, headers=owner, json={"email": "bad"}).status_code == 422
    assert client.delete(url, headers=owner).status_code == 204
    assert client.get(url, headers=owner).status_code == 404


def test_update_code_conflict(client, owner):
    create(client, owner, customer_code="A-1")
    b = create(client, owner, customer_code="B-1")
    r = client.patch(f"{API}/customers/{b['id']}", headers=owner, json={"customer_code": "a-1"})
    assert r.status_code == 409


@pytest.mark.parametrize("role", ["MANAGER"])
def test_manager_can_manage(client, owner, role):
    headers = add_user(client, owner, "m@a.uz", role)
    c = create(client, headers)
    assert client.patch(f"{API}/customers/{c['id']}", headers=headers, json={"status": "LEAD"}).status_code == 200
    assert client.delete(f"{API}/customers/{c['id']}", headers=headers).status_code == 204


@pytest.mark.parametrize("role", ["PRODUCTION_MANAGER", "WAREHOUSE_MANAGER", "QUALITY_MANAGER"])
def test_read_only_managers(client, owner, role):
    c = create(client, owner)
    headers = add_user(client, owner, "r@a.uz", role)
    url = f"{API}/customers/{c['id']}"
    assert client.get(f"{API}/customers", headers=headers).json()["total"] == 1
    assert client.get(url, headers=headers).status_code == 200
    assert client.post(f"{API}/customers", headers=headers, json=CUSTOMER).status_code == 403
    assert client.patch(url, headers=headers, json={"status": "LEAD"}).status_code == 403
    assert client.delete(url, headers=headers).status_code == 403


def test_worker_has_no_access(client, owner):
    c = create(client, owner)
    worker = add_user(client, owner, "w@a.uz", "WORKER")
    assert client.get(f"{API}/customers", headers=worker).status_code == 403
    assert client.get(f"{API}/customers/{c['id']}", headers=worker).status_code == 403
    assert client.get(f"{API}/customers/stats", headers=worker).status_code == 403


def test_factory_isolation(client, owner):
    c = create(client, owner)
    other, _ = register_owner(client, "b@b.uz", "Beta")
    assert client.get(f"{API}/customers", headers=other).json() == {"items": [], "total": 0}
    assert client.get(f"{API}/customers/countries", headers=other).json() == []
    url = f"{API}/customers/{c['id']}"
    assert client.get(url, headers=other).status_code == 404
    assert client.patch(url, headers=other, json={"name": "Hack"}).status_code == 404
    assert client.delete(url, headers=other).status_code == 404
    # super admin factory_id ni bera olmaydi — oddiy foydalanuvchi uchun e'tiborga olinmaydi
    r = client.post(f"{API}/customers", headers=other, json={**CUSTOMER, "factory_id": c["factory_id"]})
    assert r.json()["factory"]["name"] == "Beta"


def test_super_admin(client, owner):
    create(client, owner)
    admin = auth(client, ADMIN_EMAIL)
    assert client.post(f"{API}/customers", headers=admin, json=CUSTOMER).status_code == 422
    factories = client.get(f"{API}/factories", headers=admin).json()
    r = client.post(f"{API}/customers", headers=admin, json={**CUSTOMER, "factory_id": factories[0]["id"]})
    assert r.status_code == 201
    assert client.get(f"{API}/customers", headers=admin).json()["total"] == 2


def test_factory_delete_cascades_customers(client, owner):
    create(client, owner)
    admin = auth(client, ADMIN_EMAIL)
    factory_id = client.get(f"{API}/factories", headers=admin).json()[0]["id"]
    assert client.delete(f"{API}/factories/{factory_id}", headers=admin).status_code == 204
    assert client.get(f"{API}/customers", headers=admin).json()["total"] == 0
