"""Audit tuzatishlari: buyurtma holati qoidalari, bekor qilish kaskadi, yakunlash, o'chirish himoyalari,
production sozlamalari, demo to'lov va chastota cheklovi."""

import pytest

from app.core import rate_limit
from app.core.config import Settings, settings
from tests.conftest import ADMIN_EMAIL, API, auth, register_owner


@pytest.fixture()
def f(client):
    owner, factory_id = register_owner(client, "owner@a.uz", "Audit Tekstil")
    post = lambda url, body=None: client.post(f"{API}{url}", headers=owner, json=body or {})
    product = post("/products", {"name": "Polo", "code": "PL-1", "category": "Polo", "status": "ACTIVE", "price": 1000, "sizes": ["M"]}).json()
    customer = post("/customers", {"name": "Baraka", "customer_type": "COMPANY", "status": "ACTIVE", "phone": "+998901234567"}).json()
    loc = post("/inventory/locations", {"code": "TM", "name": "Tayyor"}).json()

    def order(qty=10):
        return post("/orders", {"customer_id": customer["id"], "items": [{"product_id": product["id"], "quantity": qty, "size": "M"}]}).json()

    def produce(order_obj, qty):
        wo = client.post(f"{API}/orders/{order_obj['id']}/work-orders", headers=owner, json={}).json()[0]
        for st in ("CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL", "PACKING"):
            assert post(f"/production/work-orders/{wo['id']}/logs", {"stage": st, "quantity_good": qty}).status_code == 201
        return wo

    return {"owner": owner, "factory_id": factory_id, "post": post, "order": order, "produce": produce, "loc": loc, "product": product}


def status_of(client, f, order_id):
    return client.get(f"{API}/orders/{order_id}", headers=f["owner"]).json()["status"]


def set_status(client, f, order_id, value):
    return client.patch(f"{API}/orders/{order_id}/status", headers=f["owner"], json={"status": value})


def test_manual_status_moves_forward_only(client, f):
    o = f["order"]()
    assert set_status(client, f, o["id"], "READY").status_code == 200
    r = set_status(client, f, o["id"], "NEW")
    assert r.status_code == 409 and "orqaga" in r.json()["detail"]


def test_status_respects_shipments_and_cancel_cascades(client, f):
    o = f["order"]()
    wo = f["produce"](o, 10)
    f["post"]("/finished-goods/receive", {"work_order_id": wo["id"], "location_id": f["loc"]["id"], "quantity": 10})
    item_id = client.get(f"{API}/orders/{o['id']}/shipping", headers=f["owner"]).json()["lines"][0]["order_item_id"]
    sh = f["post"]("/shipments", {"order_id": o["id"], "items": [{"order_item_id": item_id, "quantity": 4}]}).json()
    assert set_status(client, f, o["id"], "SHIPPED").status_code == 409
    assert set_status(client, f, o["id"], "COMPLETED").status_code == 409

    o2 = f["order"]()
    wo2 = client.post(f"{API}/orders/{o2['id']}/work-orders", headers=f["owner"], json={}).json()[0]
    f["post"](f"/production/work-orders/{wo2['id']}/logs", {"stage": "CUTTING", "quantity_good": 5})
    assert set_status(client, f, o2["id"], "CANCELLED").status_code == 200
    assert client.get(f"{API}/production/work-orders/{wo2['id']}", headers=f["owner"]).json()["status"] == "CANCELLED"
    r = f["post"](f"/production/work-orders/{wo2['id']}/logs", {"stage": "SEWING", "quantity_good": 1})
    assert r.status_code == 409
    assert client.post(f"{API}/orders/{o2['id']}/payment", headers=f["owner"]).status_code == 409

    client.post(f"{API}/shipments/{sh['id']}/ship", headers=f["owner"], json={})
    r = set_status(client, f, o["id"], "CANCELLED")
    assert r.status_code == 409 and "jo'natilgan" in r.json()["detail"]


def test_cancel_cancels_preparing_shipments(client, f):
    o = f["order"]()
    wo = f["produce"](o, 10)
    f["post"]("/finished-goods/receive", {"work_order_id": wo["id"], "location_id": f["loc"]["id"], "quantity": 10})
    item_id = client.get(f"{API}/orders/{o['id']}/shipping", headers=f["owner"]).json()["lines"][0]["order_item_id"]
    sh = f["post"]("/shipments", {"order_id": o["id"], "items": [{"order_item_id": item_id, "quantity": 10}]}).json()
    assert set_status(client, f, o["id"], "CANCELLED").status_code == 200
    assert client.get(f"{API}/shipments/{sh['id']}", headers=f["owner"]).json()["status"] == "CANCELLED"


def test_payment_after_delivery_completes_order(client, f):
    o = f["order"]()
    wo = f["produce"](o, 10)
    f["post"]("/finished-goods/receive", {"work_order_id": wo["id"], "location_id": f["loc"]["id"], "quantity": 10})
    item_id = client.get(f"{API}/orders/{o['id']}/shipping", headers=f["owner"]).json()["lines"][0]["order_item_id"]
    sh = f["post"]("/shipments", {"order_id": o["id"], "items": [{"order_item_id": item_id, "quantity": 10}]}).json()
    f["post"](f"/shipments/{sh['id']}/ship")
    f["post"](f"/shipments/{sh['id']}/deliver", {"received_by": "Ali"})
    assert status_of(client, f, o["id"]) == "SHIPPED"
    assert client.post(f"{API}/orders/{o['id']}/payment", headers=f["owner"]).status_code == 200
    assert status_of(client, f, o["id"]) == "COMPLETED"


def test_packing_log_delete_blocked_after_fg_receipt(client, f):
    o = f["order"](20)
    wo = client.post(f"{API}/orders/{o['id']}/work-orders", headers=f["owner"], json={}).json()[0]
    for st in ("CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL"):
        f["post"](f"/production/work-orders/{wo['id']}/logs", {"stage": st, "quantity_good": 20})
    f["post"](f"/production/work-orders/{wo['id']}/logs", {"stage": "PACKING", "quantity_good": 5})
    d = f["post"](f"/production/work-orders/{wo['id']}/logs", {"stage": "PACKING", "quantity_good": 5}).json()
    assert d["status"] == "IN_PROGRESS"
    f["post"]("/finished-goods/receive", {"work_order_id": wo["id"], "location_id": f["loc"]["id"], "quantity": 8})
    pack_log = next(x for x in d["logs"] if x["stage"] == "PACKING")
    r = client.delete(f"{API}/production/logs/{pack_log['id']}", headers=f["owner"])
    assert r.status_code == 409 and "Omborga 8" in r.json()["detail"]


def test_delete_guards_keep_history(client, f):
    admin = auth(client, ADMIN_EMAIL)
    f["order"]()
    r = client.delete(f"{API}/factories/{f['factory_id']}", headers=admin)
    assert r.status_code == 409 and "nofaol" in r.json()["detail"]

    emp = f["post"]("/employees", {"full_name": "Dilnoza", "department": "SEWING"}).json()
    wo = f["post"]("/production/work-orders", {"product_id": f["product"]["id"], "quantity": 5, "size": "M"}).json()
    f["post"](f"/production/work-orders/{wo['id']}/logs", {"stage": "CUTTING", "quantity_good": 5, "employee_id": emp["id"]})
    r = client.delete(f"{API}/employees/{emp['id']}", headers=f["owner"])
    assert r.status_code == 409


def test_production_settings_are_validated():
    weak = Settings(ENVIRONMENT="production", JWT_SECRET_KEY="change-me", PAYMENT_PROVIDER="demo", _env_file=None)
    with pytest.raises(RuntimeError) as exc:
        weak.validate_for_production()
    assert "JWT_SECRET_KEY" in str(exc.value) and "SUPERADMIN_PASSWORD" in str(exc.value) and "demo" in str(exc.value)
    strong = Settings(ENVIRONMENT="production", JWT_SECRET_KEY="x" * 40, SUPERADMIN_PASSWORD="Strong-pass-12345",
                      PAYMENT_PROVIDER="demo", ALLOW_DEMO_PAYMENTS=True, _env_file=None)
    strong.validate_for_production()
    Settings(ENVIRONMENT="development", _env_file=None).validate_for_production()


def test_demo_payment_disabled_in_production(client, f, monkeypatch):
    r = client.post(f"{API}/store/orders", json={"factory_id": f["factory_id"], "items": [{"product_id": f["product"]["id"], "quantity": 1, "size": "M"}],
                                                 "customer_name": "Ali Valiyev", "customer_phone": "+998907770011"})
    token = r.json()["order"]["public_token"]
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert client.post(f"{API}/store/orders/{token}/pay/demo", json={"card_last4": "4242"}).status_code == 503
    monkeypatch.setattr(settings, "ALLOW_DEMO_PAYMENTS", True)
    assert client.post(f"{API}/store/orders/{token}/pay/demo", json={"card_last4": "4242"}).status_code == 200


def test_login_rate_limit(client, monkeypatch):
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    rate_limit.reset()
    try:
        codes = [client.post(f"{API}/auth/login", json={"email": "victim@a.uz", "password": f"wrong{i}"}).status_code for i in range(11)]
        assert codes[:10] == [401] * 10 and codes[10] == 429
    finally:
        rate_limit.reset()


def test_login_rate_limit_db_backend(client, monkeypatch):
    """Vercel rejimi: hisob bazada — xotira tozalansa ham (boshqa nusxa) cheklov saqlanadi."""
    monkeypatch.setattr(settings, "RATE_LIMIT_ENABLED", True)
    monkeypatch.setattr(settings, "RATE_LIMIT_BACKEND", "db")
    login = lambda i: client.post(f"{API}/auth/login", json={"email": "victim@a.uz", "password": f"wrong{i}"}).status_code
    codes = [login(i) for i in range(10)]
    rate_limit.reset()
    codes.append(login(10))
    assert codes[:10] == [401] * 10 and codes[10] == 429
