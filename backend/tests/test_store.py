"""Ochiq katalog, buyurtma, test to'lov va zavod tomonidagi buyurtmalar."""

import pytest

from tests.conftest import ADMIN_EMAIL, API, add_user, auth, register_owner

PNG_1PX = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def product(client, headers, code, price=50000, status="ACTIVE", **extra):
    body = {"name": f"Mahsulot {code}", "code": code, "category": "Futbolka", "status": status, "price": price, **extra}
    r = client.post(f"{API}/products", headers=headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture()
def shop(client):
    """Zavod: 2 ta sotuvdagi mahsulot + qoralama + narxsiz mahsulot."""
    owner, factory_id = register_owner(client, "owner@a.uz", "Alpha Textile")
    client.patch(
        f"{API}/factories/{factory_id}",
        headers=owner,
        json={"short_description": "Paxta futbolkalar", "city": "Toshkent", "description": "20 yillik tajriba"},
    )
    polo = product(client, owner, "PL-1", price=85000)
    tee = product(client, owner, "TS-1", price=42500.5, category="Ko'ylak")
    draft = product(client, owner, "DR-1", status="DRAFT")
    no_price = product(client, owner, "NP-1", price=None)
    return {"owner": owner, "factory_id": factory_id, "polo": polo, "tee": tee, "draft": draft, "no_price": no_price}


def checkout(client, shop, items=None, **extra):
    body = {
        "factory_id": shop["factory_id"],
        "items": items
        if items is not None
        else [{"product_id": shop["polo"]["id"], "quantity": 2}, {"product_id": shop["tee"]["id"], "quantity": 3}],
        "customer_name": "Aziz Karimov",
        "customer_phone": "+998 90 123 45 67",
        "delivery_address": "Samarqand",
        **extra,
    }
    return client.post(f"{API}/store/orders", json=body)


def pay(client, token, last4="4242"):
    return client.post(f"{API}/store/orders/{token}/pay/demo", json={"card_last4": last4})


def test_catalog_lists_only_public_factories_with_products(client, shop):
    register_owner(client, "empty@b.uz", "Bo'sh zavod")
    factories = client.get(f"{API}/store/factories").json()
    assert [f["name"] for f in factories] == ["Alpha Textile"]
    card = factories[0]
    assert card["product_count"] == 2
    assert card["min_price"] == 42500.5
    assert set(card["categories"]) == {"Futbolka", "Ko'ylak"}
    assert card["short_description"] == "Paxta futbolkalar"


def test_factory_page_shows_only_sellable_products(client, shop):
    detail = client.get(f"{API}/store/factories/{shop['factory_id']}").json()
    assert {p["code"] for p in detail["products"]} == {"PL-1", "TS-1"}
    assert detail["description"] == "20 yillik tajriba"
    assert "bom_items" not in detail["products"][0]
    assert "status" not in detail["products"][0]


def test_hidden_or_inactive_factory_not_in_catalog(client, shop):
    client.patch(f"{API}/factories/{shop['factory_id']}", headers=shop["owner"], json={"is_public": False})
    assert client.get(f"{API}/store/factories").json() == []
    assert client.get(f"{API}/store/factories/{shop['factory_id']}").status_code == 404
    assert checkout(client, shop).status_code == 404


def test_catalog_needs_no_login(client, shop):
    assert client.get(f"{API}/store/factories").status_code == 200
    assert checkout(client, shop).status_code == 201


def test_checkout_computes_total_on_server(client, shop):
    r = checkout(client, shop)
    assert r.status_code == 201, r.text
    body = r.json()
    order = body["order"]
    assert order["total_amount"] == 2 * 85000 + 3 * 42500.5
    assert order["status"] == "PENDING_PAYMENT"
    assert order["order_number"].startswith("B-")
    assert body["payment"] == {"provider": "demo", "test_mode": True, "checkout_url": None}


def test_checkout_merges_duplicate_lines(client, shop):
    pid = shop["polo"]["id"]
    order = checkout(client, shop, items=[{"product_id": pid, "quantity": 1}, {"product_id": pid, "quantity": 4}]).json()["order"]
    assert len(order["items"]) == 1 and order["items"][0]["quantity"] == 5


@pytest.mark.parametrize("key", ["draft", "no_price"])
def test_checkout_rejects_unsellable_products(client, shop, key):
    r = checkout(client, shop, items=[{"product_id": shop[key]["id"], "quantity": 1}])
    assert r.status_code == 422


def test_checkout_rejects_other_factory_product(client, shop):
    other, _ = register_owner(client, "b@b.uz", "Beta")
    foreign = product(client, other, "X-1")
    r = checkout(client, shop, items=[{"product_id": foreign["id"], "quantity": 1}])
    assert r.status_code == 422


@pytest.mark.parametrize(
    "extra",
    [
        {"customer_phone": "abc"},
        {"customer_name": " "},
        {"items": []},
        {"items": [{"product_id": 1, "quantity": 0}]},
    ],
)
def test_checkout_validation(client, shop, extra):
    assert checkout(client, shop, **extra).status_code == 422


def test_unpaid_order_invisible_to_factory(client, shop):
    checkout(client, shop)
    assert client.get(f"{API}/orders", headers=shop["owner"]).json()["total"] == 0


def test_demo_payment_makes_order_visible_and_links_crm(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    r = pay(client, token)
    assert r.status_code == 200, r.text
    assert r.json()["payment_status"] == "PAID"
    assert r.json()["status"] == "NEW"
    assert r.json()["card_last4"] == "4242"

    orders = client.get(f"{API}/orders", headers=shop["owner"]).json()
    assert orders["total"] == 1
    assert orders["items"][0]["items_count"] == 2
    assert orders["items"][0]["total_quantity"] == 5
    assert client.get(f"{API}/orders/summary", headers=shop["owner"]).json()["new_count"] == 1

    customers = client.get(f"{API}/customers", headers=shop["owner"]).json()
    assert customers["total"] == 1
    assert customers["items"][0]["name"] == "Aziz Karimov"

    token2 = checkout(client, shop, customer_phone="998901234567").json()["order"]["public_token"]
    pay(client, token2)
    assert client.get(f"{API}/customers", headers=shop["owner"]).json()["total"] == 1
    detail = client.get(f"{API}/orders/{orders['items'][0]['id']}", headers=shop["owner"]).json()
    assert detail["customer"]["name"] == "Aziz Karimov"


def test_double_payment_rejected(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    assert pay(client, token).status_code == 200
    assert pay(client, token).status_code == 409


def test_payment_accepts_only_last4(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    assert client.post(f"{API}/store/orders/{token}/pay/demo", json={"card_last4": "4242424242424242"}).status_code == 422


def test_public_order_lookup_by_token_only(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    assert client.get(f"{API}/store/orders/{token}").json()["factory_name"] == "Alpha Textile"
    assert client.get(f"{API}/store/orders/wrong-token").status_code == 404


def test_order_snapshot_survives_product_change(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    pay(client, token)
    client.patch(f"{API}/products/{shop['polo']['id']}", headers=shop["owner"], json={"price": 1, "name": "Boshqa"})
    order_id = client.get(f"{API}/orders", headers=shop["owner"]).json()["items"][0]["id"]
    items = client.get(f"{API}/orders/{order_id}", headers=shop["owner"]).json()["items"]
    polo_line = next(i for i in items if i["product_code"] == "PL-1")
    assert polo_line["unit_price"] == 85000 and polo_line["product_name"] == "Mahsulot PL-1"


def test_featured_one_per_factory_with_images(client, shop):
    owner = shop["owner"]
    client.patch(f"{API}/products/{shop['polo']['id']}", headers=owner, json={"image_url": "/media/a.jpg", "model_image_url": "/media/a-model.jpg"})
    client.patch(f"{API}/products/{shop['tee']['id']}", headers=owner, json={"image_url": "/media/b.jpg"})
    client.patch(f"{API}/products/{shop['draft']['id']}", headers=owner, json={"image_url": "/media/c.jpg"})
    other, _ = register_owner(client, "b@b.uz", "Beta")
    beta = product(client, other, "B-1", image_url="/media/d.jpg")

    featured = client.get(f"{API}/store/featured").json()
    assert len(featured) == 2
    by_factory = {f["factory_id"]: f for f in featured}
    alpha = by_factory[shop["factory_id"]]
    assert alpha["product_id"] == shop["polo"]["id"]
    assert alpha["image_url"] == "/media/a-model.jpg"
    assert alpha["factory_name"] == "Alpha Textile"
    assert any(f["product_id"] == beta["id"] for f in featured)


def test_featured_skips_products_without_images_and_hidden_factories(client, shop):
    assert client.get(f"{API}/store/featured").json() == []
    client.patch(f"{API}/products/{shop['polo']['id']}", headers=shop["owner"], json={"image_url": "/media/a.jpg"})
    assert len(client.get(f"{API}/store/featured").json()) == 1
    client.patch(f"{API}/factories/{shop['factory_id']}", headers=shop["owner"], json={"is_public": False})
    assert client.get(f"{API}/store/featured").json() == []


def test_my_orders_returns_only_paid(client, shop):
    paid = checkout(client, shop).json()["order"]["public_token"]
    pay(client, paid)
    unpaid = checkout(client, shop).json()["order"]["public_token"]
    r = client.post(f"{API}/store/orders/my", json={"tokens": [paid, unpaid, "noma'lum-kalit"]})
    assert r.status_code == 200
    orders = r.json()
    assert [o["public_token"] for o in orders] == [paid]
    assert orders[0]["factory_id"] == shop["factory_id"]
    assert orders[0]["status"] == "NEW"


def test_my_orders_reflect_factory_status(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    pay(client, token)
    order_id = client.get(f"{API}/orders", headers=shop["owner"]).json()["items"][0]["id"]
    client.patch(f"{API}/orders/{order_id}/status", headers=shop["owner"], json={"status": "IN_PRODUCTION"})
    assert client.post(f"{API}/store/orders/my", json={"tokens": [token]}).json()[0]["status"] == "IN_PRODUCTION"


def test_my_orders_limits(client):
    assert client.post(f"{API}/store/orders/my", json={"tokens": []}).json() == []
    assert client.post(f"{API}/store/orders/my", json={"tokens": ["x"] * 101}).status_code == 422


def test_find_order_by_number_and_phone(client, shop):
    order = checkout(client, shop).json()["order"]
    pay(client, order["public_token"])
    number = order["order_number"]

    def find(num, phone):
        return client.post(f"{API}/store/orders/find", json={"order_number": num, "customer_phone": phone})

    r = find(number.lower(), "90 123 45 67")
    assert r.status_code == 200 and r.json()["public_token"] == order["public_token"]
    assert find(number, "+998 90 000 00 00").status_code == 404
    assert find("B-999999", "+998 90 123 45 67").status_code == 404


def test_find_unpaid_order_not_found(client, shop):
    order = checkout(client, shop).json()["order"]
    r = client.post(f"{API}/store/orders/find", json={"order_number": order["order_number"], "customer_phone": "+998 90 123 45 67"})
    assert r.status_code == 404


@pytest.fixture()
def tee_variants(client, shop):
    return product(client, shop["owner"], "VR-1", price=100000, sizes=["S", "M", "L"], colors=["Oq", "Qora"])


def test_variant_lines_are_separate(client, shop, tee_variants):
    pid = tee_variants["id"]
    items = [
        {"product_id": pid, "quantity": 20, "size": "M", "color": "Oq"},
        {"product_id": pid, "quantity": 30, "size": "L", "color": "Qora"},
        {"product_id": pid, "quantity": 5, "size": "M", "color": "Oq"},
    ]
    order = checkout(client, shop, items=items).json()["order"]
    lines = sorted((i["size"], i["color"], i["quantity"]) for i in order["items"])
    assert lines == [("L", "Qora", 30), ("M", "Oq", 25)]
    assert order["total_amount"] == 55 * 100000

    token = order["public_token"]
    pay(client, token)
    order_id = client.get(f"{API}/orders", headers=shop["owner"]).json()["items"][0]["id"]
    staff_items = client.get(f"{API}/orders/{order_id}", headers=shop["owner"]).json()["items"]
    assert {(i["size"], i["color"]) for i in staff_items} == {("M", "Oq"), ("L", "Qora")}


@pytest.mark.parametrize(
    "variant",
    [
        {},
        {"size": "M"},
        {"size": "XXL", "color": "Oq"},
        {"size": "M", "color": "Yashil"},
    ],
)
def test_variant_required_and_validated(client, shop, tee_variants, variant):
    r = checkout(client, shop, items=[{"product_id": tee_variants["id"], "quantity": 1, **variant}])
    assert r.status_code == 422, r.text


def test_variant_not_allowed_for_simple_product(client, shop):
    r = checkout(client, shop, items=[{"product_id": shop["polo"]["id"], "quantity": 1, "size": "M"}])
    assert r.status_code == 422


@pytest.fixture()
def paid_order(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    pay(client, token)
    return client.get(f"{API}/orders", headers=shop["owner"]).json()["items"][0]


def test_status_workflow(client, shop, paid_order):
    url = f"{API}/orders/{paid_order['id']}/status"
    for s in ("CONFIRMED", "IN_PRODUCTION", "READY", "SHIPPED", "COMPLETED"):
        r = client.patch(url, headers=shop["owner"], json={"status": s})
        assert r.status_code == 200 and r.json()["status"] == s
    assert client.patch(url, headers=shop["owner"], json={"status": "NEW"}).status_code == 409
    token = client.get(f"{API}/orders/{paid_order['id']}", headers=shop["owner"]).json()
    assert token["status"] == "COMPLETED"


def test_pending_status_cannot_be_set(client, shop, paid_order):
    r = client.patch(f"{API}/orders/{paid_order['id']}/status", headers=shop["owner"], json={"status": "PENDING_PAYMENT"})
    assert r.status_code == 422


def test_order_roles(client, shop, paid_order):
    url = f"{API}/orders/{paid_order['id']}"
    warehouse = add_user(client, shop["owner"], "wh@a.uz", "WAREHOUSE_MANAGER")
    assert client.get(url, headers=warehouse).status_code == 200
    assert client.patch(f"{url}/status", headers=warehouse, json={"status": "CONFIRMED"}).status_code == 403
    prod = add_user(client, shop["owner"], "pm@a.uz", "PRODUCTION_MANAGER")
    assert client.patch(f"{url}/status", headers=prod, json={"status": "CONFIRMED"}).status_code == 200
    for role, email in (("WORKER", "w@a.uz"), ("QUALITY_MANAGER", "q@a.uz")):
        headers = add_user(client, shop["owner"], email, role)
        assert client.get(f"{API}/orders", headers=headers).status_code == 403


def test_orders_factory_isolation(client, shop, paid_order):
    other, _ = register_owner(client, "b@b.uz", "Beta")
    assert client.get(f"{API}/orders", headers=other).json()["total"] == 0
    assert client.get(f"{API}/orders/{paid_order['id']}", headers=other).status_code == 404
    admin = auth(client, ADMIN_EMAIL)
    assert client.get(f"{API}/orders", headers=admin).json()["total"] == 1


def test_orders_search(client, shop, paid_order):
    headers = shop["owner"]
    assert client.get(f"{API}/orders", headers=headers, params={"search": paid_order["order_number"]}).json()["total"] == 1
    assert client.get(f"{API}/orders", headers=headers, params={"search": "aziz"}).json()["total"] == 1
    assert client.get(f"{API}/orders", headers=headers, params={"status": "SHIPPED"}).json()["total"] == 0


def test_upload_image(client, shop):
    r = client.post(f"{API}/uploads/images", headers=shop["owner"], files={"file": ("logo.png", PNG_1PX, "image/png")})
    assert r.status_code == 201, r.text
    url = r.json()["url"]
    assert url.startswith("/media/") and url.endswith(".png")
    assert client.get(url).content == PNG_1PX
    r = client.patch(f"{API}/factories/{shop['factory_id']}", headers=shop["owner"], json={"logo_url": url})
    assert r.json()["logo_url"] == url


def test_upload_image_to_supabase(client, shop, monkeypatch):
    from app.core.config import settings
    from app.services import upload_service

    monkeypatch.setattr(settings, "SUPABASE_URL", "https://abc.supabase.co/")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "sb_secret_test")
    calls = []

    class Ok:
        status_code = 200
        text = "{}"

    monkeypatch.setattr(upload_service.requests, "post", lambda url, **kw: calls.append((url, kw)) or Ok())
    r = client.post(f"{API}/uploads/images", headers=shop["owner"], files={"file": ("logo.png", PNG_1PX, "image/png")})
    assert r.status_code == 201, r.text
    url = r.json()["url"]
    name = url.rsplit("/", 1)[1]
    assert url == f"https://abc.supabase.co/storage/v1/object/public/media/{name}" and name.endswith(".png")
    (target, kw), = calls
    assert target == f"https://abc.supabase.co/storage/v1/object/media/{name}"
    assert kw["data"] == PNG_1PX and kw["headers"]["Content-Type"] == "image/png"
    assert kw["headers"]["apikey"] == "sb_secret_test"
    r = client.patch(f"{API}/factories/{shop['factory_id']}", headers=shop["owner"], json={"logo_url": url})
    assert r.json()["logo_url"] == url

    class Fail:
        status_code = 403
        text = "bucket not found"

    monkeypatch.setattr(upload_service.requests, "post", lambda url, **kw: Fail())
    r = client.post(f"{API}/uploads/images", headers=shop["owner"], files={"file": ("logo.png", PNG_1PX, "image/png")})
    assert r.status_code == 502


def test_upload_rejects_non_images(client, shop):
    r = client.post(f"{API}/uploads/images", headers=shop["owner"], files={"file": ("x.png", b"<script>", "image/png")})
    assert r.status_code == 422


def test_upload_requires_role(client, shop):
    worker = add_user(client, shop["owner"], "w@a.uz", "WORKER")
    r = client.post(f"{API}/uploads/images", headers=worker, files={"file": ("a.png", PNG_1PX, "image/png")})
    assert r.status_code == 403
    assert client.post(f"{API}/uploads/images", files={"file": ("a.png", PNG_1PX, "image/png")}).status_code == 401


def test_media_url_validation(client, shop):
    r = client.patch(f"{API}/factories/{shop['factory_id']}", headers=shop["owner"], json={"logo_url": "javascript:alert(1)"})
    assert r.status_code == 422


def test_catalog_products_search_filter_sort(client, shop):
    other, other_id = register_owner(client, "owner@b.uz", "Beta Jinsi")
    product(client, other, "JN-1", price=120000, category="Jinsi", description="Klassik ko'k jinsi")

    r = client.get(f"{API}/store/products").json()
    assert r["total"] == 3
    assert {c["name"]: c["count"] for c in r["categories"]} == {"Futbolka": 1, "Ko'ylak": 1, "Jinsi": 1}
    assert {p["code"] for p in r["items"]} == {"PL-1", "TS-1", "JN-1"}
    assert all(p["factory_name"] for p in r["items"])

    prices = [p["price"] for p in client.get(f"{API}/store/products", params={"sort": "price_asc"}).json()["items"]]
    assert prices == sorted(prices)
    prices = [p["price"] for p in client.get(f"{API}/store/products", params={"sort": "price_desc"}).json()["items"]]
    assert prices == sorted(prices, reverse=True)

    found = client.get(f"{API}/store/products", params={"search": "ko'k"}).json()
    assert [p["code"] for p in found["items"]] == ["JN-1"]
    by_factory = client.get(f"{API}/store/products", params={"search": "Alpha"}).json()
    assert by_factory["total"] == 2 and len(by_factory["categories"]) == 2

    only = client.get(f"{API}/store/products", params={"category": "Jinsi"}).json()
    assert only["total"] == 1 and len(only["categories"]) == 3

    page = client.get(f"{API}/store/products", params={"limit": 2, "offset": 2}).json()
    assert page["total"] == 3 and len(page["items"]) == 1
    assert client.get(f"{API}/store/products", params={"sort": "bad"}).status_code == 422

    client.patch(f"{API}/factories/{other_id}", headers=auth(client, ADMIN_EMAIL), json={"is_public": False})
    assert client.get(f"{API}/store/products").json()["total"] == 2
