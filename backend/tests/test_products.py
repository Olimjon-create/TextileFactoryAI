import pytest

from tests.conftest import ADMIN_EMAIL, API, add_user, auth, register_owner

PRODUCT = {
    "name": "Erkaklar futbolkasi",
    "code": "ts-001",
    "category": "Futbolka",
    "description": "  Paxta, kalta yeng  ",
    "sizes": ["S", "M", "L", "m", " "],
    "colors": ["Oq", "Qora"],
    "unit": "PIECE",
    "status": "ACTIVE",
}

BOM_FABRIC = {
    "material_type": "FABRIC",
    "material_name": "Kulirka 100% paxta",
    "quantity": 1.35,
    "unit": "METER",
    "waste_percent": 5,
}


@pytest.fixture()
def owner(client):
    headers, _ = register_owner(client, "owner@a.uz", "Alpha")
    return headers


def create_product(client, headers, **overrides):
    r = client.post(f"{API}/products", headers=headers, json={**PRODUCT, **overrides})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_product_normalizes_fields(client, owner):
    product = create_product(client, owner)
    assert product["code"] == "TS-001"
    assert product["sizes"] == ["S", "M", "L"]
    assert product["description"] == "Paxta, kalta yeng"
    assert product["bom_items"] == []


def test_create_with_inline_bom(client, owner):
    product = create_product(client, owner, bom_items=[BOM_FABRIC])
    assert product["bom_items_count"] == 1
    assert product["bom_items"][0]["quantity"] == 1.35


@pytest.mark.parametrize(
    "overrides",
    [
        {"code": "a"},
        {"code": "BAD CODE"},
        {"name": ""},
        {"unit": "LITER"},
        {"status": "UNKNOWN"},
        {"sizes": ["X" * 31]},
    ],
)
def test_product_validation(client, owner, overrides):
    r = client.post(f"{API}/products", headers=owner, json={**PRODUCT, **overrides})
    assert r.status_code == 422


def test_duplicate_code_in_same_factory(client, owner):
    create_product(client, owner)
    r = client.post(f"{API}/products", headers=owner, json={**PRODUCT, "code": "TS-001"})
    assert r.status_code == 409
    # Boshqa fabrikada xuddi shu kod ruxsat etiladi
    other, _ = register_owner(client, "b@b.uz", "Beta")
    create_product(client, other)


def test_list_search_and_filters(client, owner):
    create_product(client, owner)
    create_product(client, owner, name="Ayollar ko'ylagi", code="DR-01", category="Ko'ylak", status="DRAFT")
    assert len(client.get(f"{API}/products", headers=owner).json()) == 2
    assert len(client.get(f"{API}/products?search=dr-", headers=owner).json()) == 1
    assert len(client.get(f"{API}/products?category=Futbolka", headers=owner).json()) == 1
    assert len(client.get(f"{API}/products?status=DRAFT", headers=owner).json()) == 1
    assert client.get(f"{API}/products/categories", headers=owner).json() == ["Futbolka", "Ko'ylak"]


def test_update_and_delete_product(client, owner):
    product = create_product(client, owner)
    r = client.patch(
        f"{API}/products/{product['id']}",
        headers=owner,
        json={"status": "ARCHIVED", "colors": ["Ko'k"], "description": None},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "ARCHIVED"
    assert r.json()["colors"] == ["Ko'k"]
    assert r.json()["description"] is None
    assert client.delete(f"{API}/products/{product['id']}", headers=owner).status_code == 204
    assert client.get(f"{API}/products/{product['id']}", headers=owner).status_code == 404


def test_bom_crud(client, owner):
    product = create_product(client, owner)
    base = f"{API}/products/{product['id']}/bom"

    r = client.post(base, headers=owner, json=BOM_FABRIC)
    assert r.status_code == 201, r.text
    item_id = r.json()["id"]
    r = client.post(
        base,
        headers=owner,
        json={"material_type": "BUTTON", "material_name": "Tugma 12mm", "quantity": 4, "unit": "PIECE"},
    )
    assert r.status_code == 201

    r = client.patch(f"{base}/{item_id}", headers=owner, json={"quantity": 1.5, "notes": "Oldi va orqa"})
    assert r.status_code == 200
    assert r.json()["quantity"] == 1.5

    assert len(client.get(base, headers=owner).json()) == 2
    assert client.delete(f"{base}/{item_id}", headers=owner).status_code == 204
    assert len(client.get(base, headers=owner).json()) == 1
    assert client.delete(f"{base}/{item_id}", headers=owner).status_code == 404


@pytest.mark.parametrize(
    "bad",
    [{"quantity": 0}, {"quantity": -1}, {"unit": "LITER"}, {"material_type": "WOOD"}, {"waste_percent": 101}],
)
def test_bom_validation(client, owner, bad):
    product = create_product(client, owner)
    r = client.post(f"{API}/products/{product['id']}/bom", headers=owner, json={**BOM_FABRIC, **bad})
    assert r.status_code == 422


@pytest.mark.parametrize("role", ["MANAGER", "PRODUCTION_MANAGER"])
def test_editor_roles_can_modify(client, owner, role):
    headers = add_user(client, owner, "e@a.uz", role)
    product = create_product(client, headers)
    r = client.post(f"{API}/products/{product['id']}/bom", headers=headers, json=BOM_FABRIC)
    assert r.status_code == 201


@pytest.mark.parametrize("role", ["WAREHOUSE_MANAGER", "QUALITY_MANAGER", "WORKER"])
def test_read_only_roles(client, owner, role):
    product = create_product(client, owner)
    headers = add_user(client, owner, "r@a.uz", role)
    pid = product["id"]
    # Ko'rish mumkin
    assert client.get(f"{API}/products", headers=headers).status_code == 200
    assert client.get(f"{API}/products/{pid}", headers=headers).status_code == 200
    # O'zgartirish mumkin emas
    assert client.post(f"{API}/products", headers=headers, json={**PRODUCT, "code": "X-1"}).status_code == 403
    assert client.patch(f"{API}/products/{pid}", headers=headers, json={"name": "Yangi"}).status_code == 403
    assert client.delete(f"{API}/products/{pid}", headers=headers).status_code == 403
    assert client.post(f"{API}/products/{pid}/bom", headers=headers, json=BOM_FABRIC).status_code == 403


def test_factory_isolation(client, owner):
    product = create_product(client, owner)
    other, _ = register_owner(client, "b@b.uz", "Beta")
    assert client.get(f"{API}/products", headers=other).json() == []
    assert client.get(f"{API}/products/{product['id']}", headers=other).status_code == 404
    assert client.patch(f"{API}/products/{product['id']}", headers=other, json={"name": "Hack"}).status_code == 404
    assert client.post(f"{API}/products/{product['id']}/bom", headers=other, json=BOM_FABRIC).status_code == 404


def test_super_admin_needs_factory(client, owner):
    admin = auth(client, ADMIN_EMAIL)
    r = client.post(f"{API}/products", headers=admin, json=PRODUCT)
    assert r.status_code == 422
    factory_id = client.get(f"{API}/factories", headers=admin).json()[0]["id"]
    product = create_product(client, admin, factory_id=factory_id)
    assert product["factory"]["name"] == "Alpha"
    # Egasi super admin yaratgan mahsulotni ko'radi
    assert len(client.get(f"{API}/products", headers=owner).json()) == 1
