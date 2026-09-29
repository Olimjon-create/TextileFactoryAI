"""2-bosqich: qo'lda kiritiladigan (B2B) buyurtma, topshirish muddati, BOM asosida material ehtiyoji,
buyurtmaga chiqarish/qaytarish, reja va haqiqiy sarf (ortiqcha sarf)."""

from datetime import date, timedelta

import pytest

from tests.conftest import API, add_user, register_owner

INV = f"{API}/inventory"


@pytest.fixture()
def plant(client):
    owner, factory_id = register_owner(client, "owner@m.uz", "Mato Tekstil")
    post = lambda url, body: client.post(url, headers=owner, json=body).json()  # noqa: E731
    customer = post(f"{API}/customers", {"name": "Baraka Savdo", "customer_type": "COMPANY", "status": "ACTIVE", "phone": "+998901112233", "country": "UZ", "address": "Toshkent"})
    fabric = post(f"{INV}/materials", {"code": "FAB", "name": "Kulirka", "material_type": "FABRIC", "unit": "METER", "unit_cost": 30000})
    thread = post(f"{INV}/materials", {"code": "THR", "name": "Ip", "material_type": "THREAD", "unit": "SPOOL", "unit_cost": 8000})
    loc_a = post(f"{INV}/locations", {"code": "A", "name": "Mato ombori"})
    loc_b = post(f"{INV}/locations", {"code": "B", "name": "Sex ombori"})
    product = post(f"{API}/products", {"name": "Polo", "code": "POLO-1", "category": "Polo", "status": "ACTIVE", "price": 120000, "sizes": ["M", "L"]})
    bom = f"{API}/products/{product['id']}/bom"
    client.post(bom, headers=owner, json={"material_id": fabric["id"], "material_type": "FABRIC", "material_name": "katalogdan olinadi", "quantity": 1.2, "unit": "METER", "waste_percent": 10})
    client.post(bom, headers=owner, json={"material_id": thread["id"], "material_type": "THREAD", "material_name": "katalogdan olinadi", "quantity": 0.05, "unit": "SPOOL"})
    # Katalogga bog'lanmagan qator — ehtiyojda "bog'lanmagan" bo'lib chiqadi
    client.post(bom, headers=owner, json={"material_type": "BUTTON", "material_name": "Tugma 12mm", "quantity": 3, "unit": "PIECE"})
    return {"owner": owner, "factory_id": factory_id, "customer": customer, "fabric": fabric, "thread": thread, "a": loc_a, "b": loc_b, "product": product}


def create_order(client, p, qty=10, **extra):
    body = {"customer_id": p["customer"]["id"], "items": [{"product_id": p["product"]["id"], "quantity": qty, "size": "M"}], **extra}
    return client.post(f"{API}/orders", headers=p["owner"], json=body)


def receive(client, p, material, location, qty):
    r = client.post(f"{INV}/movements", headers=p["owner"], json={"movement_type": "RECEIPT", "material_id": material["id"], "location_id": location["id"], "quantity": qty})
    assert r.status_code == 201, r.text


def line(materials, code):
    return next(x for x in materials["lines"] if x["material_code"] == code)


def test_manual_order_creation_and_validation(client, plant):
    due = (date.today() + timedelta(days=14)).isoformat()
    r = create_order(client, plant, due_date=due, comment="Logotip ko'krakda")
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["source"] == "MANUAL" and order["status"] == "NEW" and order["payment_status"] == "PENDING"
    assert order["order_number"].startswith("B-")
    assert order["customer_name"] == "Baraka Savdo" and order["customer"]["id"] == plant["customer"]["id"]
    assert order["total_amount"] == 1_200_000  # katalog narxi × 10
    assert order["due_date"] == due and order["is_overdue"] is False
    assert order["delivery_address"] == "Toshkent"  # mijoz manzili avtomatik

    # Narxni qo'lda berish mumkin
    r = client.post(f"{API}/orders", headers=plant["owner"], json={"customer_id": plant["customer"]["id"], "items": [{"product_id": plant["product"]["id"], "quantity": 2, "size": "L", "unit_price": 100000}]})
    assert r.json()["total_amount"] == 200_000

    past = (date.today() - timedelta(days=1)).isoformat()
    assert create_order(client, plant, due_date=past).status_code == 422
    bad_variant = client.post(f"{API}/orders", headers=plant["owner"], json={"customer_id": plant["customer"]["id"], "items": [{"product_id": plant["product"]["id"], "quantity": 1}]})
    assert bad_variant.status_code == 422 and "o'lcham" in bad_variant.json()["detail"]

    other, _ = register_owner(client, "x@m.uz", "Boshqa")
    assert client.post(f"{API}/orders", headers=other, json={"customer_id": plant["customer"]["id"], "items": [{"product_id": plant["product"]["id"], "quantity": 1, "size": "M"}]}).status_code == 404
    # Manual buyurtmalar ro'yxatda ko'rinadi (to'lanmagan bo'lsa ham)
    assert client.get(f"{API}/orders", headers=plant["owner"], params={"source": "MANUAL"}).json()["total"] == 2


def test_material_requirements_from_bom(client, plant):
    order = create_order(client, plant).json()
    m = client.get(f"{API}/orders/{order['id']}/materials", headers=plant["owner"]).json()
    fabric = line(m, "FAB")
    assert fabric["planned"] == pytest.approx(13.2)  # 10 × 1.2 × 1.1
    assert fabric["status"] == "SHORTAGE" and fabric["shortage"] == pytest.approx(13.2)
    assert fabric["planned_cost"] == pytest.approx(13.2 * 30000)
    assert line(m, "THR")["planned"] == pytest.approx(0.5)
    button = next(x for x in m["lines"] if x["material_id"] is None)
    assert button["status"] == "NOT_LINKED" and button["planned"] == 30
    assert m["complete"] is False and m["not_linked_count"] == 1 and m["shortage_count"] == 2

    receive(client, plant, plant["fabric"], plant["a"], 20)
    m = client.get(f"{API}/orders/{order['id']}/materials", headers=plant["owner"]).json()
    assert line(m, "FAB")["status"] == "ENOUGH" and line(m, "FAB")["available"] == 20


def test_issue_auto_allocates_and_tracks_variance(client, plant):
    order = create_order(client, plant).json()
    receive(client, plant, plant["fabric"], plant["a"], 12)
    receive(client, plant, plant["fabric"], plant["b"], 8)
    url = f"{API}/orders/{order['id']}/materials/issue"

    r = client.post(url, headers=plant["owner"], json={"lines": [{"material_id": plant["fabric"]["id"], "quantity": 13.2}], "note": "Kesish sexi"})
    assert r.status_code == 200, r.text
    fabric = line(r.json(), "FAB")
    assert fabric["issued"] == pytest.approx(13.2) and fabric["status"] == "ISSUED" and fabric["remaining"] == 0
    # 12 A dan (ko'pi), qolgan 1.2 B dan; har biri buyurtmaga bog'langan
    moves = client.get(f"{INV}/movements", headers=plant["owner"], params={"order_id": order["id"]}).json()["items"]
    assert sorted((mv["location"]["code"], mv["quantity"]) for mv in moves) == [("A", -12.0), ("B", -1.2)]
    assert all(mv["order_number"] == order["order_number"] for mv in moves)
    assert client.get(f"{INV}/materials/{plant['fabric']['id']}", headers=plant["owner"]).json()["stock"] == pytest.approx(6.8)

    # Ortiqcha chiqarish — ortiqcha sarf sifatida belgilanadi
    fabric = line(client.post(url, headers=plant["owner"], json={"lines": [{"material_id": plant["fabric"]["id"], "quantity": 1}]}).json(), "FAB")
    assert fabric["status"] == "OVERUSED" and fabric["variance"] == pytest.approx(1) and fabric["variance_pct"] == pytest.approx(7.6)

    # Qaytarish: joy majburiy, chiqarilgandan ko'p qaytarib bo'lmaydi
    ret = {"mode": "RETURN", "lines": [{"material_id": plant["fabric"]["id"], "quantity": 1, "location_id": plant["a"]["id"]}]}
    fabric = line(client.post(url, headers=plant["owner"], json=ret).json(), "FAB")
    assert fabric["status"] == "ISSUED" and fabric["issued"] == pytest.approx(13.2)
    ret["lines"][0]["quantity"] = 50
    assert client.post(url, headers=plant["owner"], json=ret).status_code == 422
    del ret["lines"][0]["location_id"]
    ret["lines"][0]["quantity"] = 1
    assert client.post(url, headers=plant["owner"], json=ret).status_code == 422


def test_issue_is_atomic_and_respects_stock(client, plant):
    order = create_order(client, plant).json()
    receive(client, plant, plant["fabric"], plant["a"], 20)
    url = f"{API}/orders/{order['id']}/materials/issue"
    # Ikkinchi qator uchun ombor yetmaydi — birinchisi ham yozilmasligi kerak
    r = client.post(url, headers=plant["owner"], json={"lines": [{"material_id": plant["fabric"]["id"], "quantity": 5}, {"material_id": plant["thread"]["id"], "quantity": 1}]})
    assert r.status_code == 422 and "THR" in r.json()["detail"]
    assert client.get(f"{INV}/materials/{plant['fabric']['id']}", headers=plant["owner"]).json()["stock"] == 20

    client.patch(f"{API}/orders/{order['id']}/status", headers=plant["owner"], json={"status": "CANCELLED"})
    assert client.post(url, headers=plant["owner"], json={"lines": [{"material_id": plant["fabric"]["id"], "quantity": 1}]}).status_code == 409


def test_due_date_overdue_and_manual_payment(client, plant):
    order = create_order(client, plant).json()
    url = f"{API}/orders/{order['id']}"
    past = (date.today() - timedelta(days=3)).isoformat()
    r = client.patch(url, headers=plant["owner"], json={"due_date": past})
    assert r.status_code == 200 and r.json()["is_overdue"] is True
    overdue = client.get(f"{API}/orders", headers=plant["owner"], params={"overdue": True}).json()
    assert overdue["total"] == 1 and overdue["items"][0]["is_overdue"] is True
    client.patch(f"{url}/status", headers=plant["owner"], json={"status": "SHIPPED"})
    assert client.get(f"{API}/orders", headers=plant["owner"], params={"overdue": True}).json()["total"] == 0

    r = client.post(f"{url}/payment", headers=plant["owner"])
    assert r.status_code == 200 and r.json()["payment_status"] == "PAID" and r.json()["paid_at"]
    assert client.post(f"{url}/payment", headers=plant["owner"]).status_code == 409
    actions = [x["summary"] for x in client.get(f"{API}/audit-logs", headers=plant["owner"], params={"entity": "order"}).json()["items"]]
    assert any("kiritildi" in s for s in actions) and any("to'lov qabul" in s for s in actions)


def test_roles(client, plant):
    order = create_order(client, plant).json()
    receive(client, plant, plant["fabric"], plant["a"], 20)
    keeper = add_user(client, plant["owner"], "k@m.uz", "WAREHOUSE_MANAGER")
    planner = add_user(client, plant["owner"], "p@m.uz", "PRODUCTION_MANAGER")
    issue = {"lines": [{"material_id": plant["fabric"]["id"], "quantity": 1}]}
    # Ombor mudiri chiqaradi, lekin buyurtma kiritmaydi
    assert client.post(f"{API}/orders/{order['id']}/materials/issue", headers=keeper, json=issue).status_code == 200
    assert create_order(client, {**plant, "owner": keeper}).status_code == 403
    # Ishlab chiqarish boshlig'i buyurtma kiritadi va ehtiyojni ko'radi, lekin ombordan chiqarmaydi
    assert create_order(client, {**plant, "owner": planner}).status_code == 201
    assert client.get(f"{API}/orders/{order['id']}/materials", headers=planner).status_code == 200
    assert client.post(f"{API}/orders/{order['id']}/materials/issue", headers=planner, json=issue).status_code == 403
