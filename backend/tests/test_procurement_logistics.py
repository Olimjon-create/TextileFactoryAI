"""5-bosqich: yetkazib beruvchilar, xarid → ombor kirimi, tayyor mahsulot ombori, jo'natma → buyurtma holati."""

from datetime import date, timedelta

import pytest

from tests.conftest import API, add_user, register_owner


@pytest.fixture()
def f(client):
    owner, factory_id = register_owner(client, "owner@l.uz", "Logistika Tekstil")
    post = lambda url, body: client.post(f"{API}{url}", headers=owner, json=body)  # noqa: E731
    fabric = post("/inventory/materials", {"code": "FAB", "name": "Pike", "material_type": "FABRIC", "unit": "METER", "unit_cost": 30000}).json()
    thread = post("/inventory/materials", {"code": "THR", "name": "Ip", "material_type": "THREAD", "unit": "PIECE"}).json()
    loc = post("/inventory/locations", {"code": "A-1", "name": "Mato ombori"}).json()
    fg = post("/inventory/locations", {"code": "TM-1", "name": "Tayyor mahsulot"}).json()
    product = post("/products", {"name": "Polo", "code": "PL-1", "category": "Polo", "status": "ACTIVE", "price": 100000, "sizes": ["M", "L"]}).json()
    post(f"/products/{product['id']}/bom", {"material_id": fabric["id"], "material_type": "FABRIC", "material_name": "katalogdan", "quantity": 1.5, "unit": "METER", "waste_percent": 0})
    customer = post("/customers", {"name": "Baraka", "customer_type": "COMPANY", "status": "ACTIVE", "phone": "+998901234567", "country": "UZ"}).json()
    order = post("/orders", {"customer_id": customer["id"], "due_date": (date.today() + timedelta(days=10)).isoformat(),
                             "items": [{"product_id": product["id"], "quantity": 10, "size": "M"}, {"product_id": product["id"], "quantity": 5, "size": "L"}]}).json()
    return {"owner": owner, "post": post, "fabric": fabric, "thread": thread, "loc": loc, "fg": fg, "product": product, "order": order}


def test_supplier_purchase_receive_flow(client, f):
    o, post = f["owner"], f["post"]
    sup = post("/suppliers", {"name": "Mato Savdo", "phone": "+998901112233", "lead_time_days": 5}).json()
    assert sup["code"] == "SUP-00001" and sup["stats"]["orders_total"] == 0

    # Material ehtiyoji: 10×1.5 + 5×1.5 = 22.5 m, omborda 0 → yetishmaydi, yo'lda 0
    req = client.get(f"{API}/orders/{f['order']['id']}/materials", headers=o).json()
    line = next(x for x in req["lines"] if x["material_id"] == f["fabric"]["id"])
    assert line["shortage"] == pytest.approx(22.5) and line["on_order"] == 0

    r = post("/purchase-orders", {"supplier_id": sup["id"], "order_id": f["order"]["id"], "items": [
        {"material_id": f["fabric"]["id"], "quantity": 30, "unit_price": 32000},
        {"material_id": f["thread"]["id"], "quantity": 100, "unit_price": 500},
    ]})
    assert r.status_code == 201, r.text
    po = r.json()
    assert po["number"] == "PO-000001" and po["status"] == "DRAFT" and po["total_amount"] == 30 * 32000 + 100 * 500
    assert po["expected_date"] == (date.today() + timedelta(days=5)).isoformat()  # yetkazib beruvchining odatiy muddati
    assert po["order_number"] == f["order"]["order_number"]
    # Qoralamani qabul qilib bo'lmaydi; bir material ikki marta kiritilmaydi
    fab_item = next(x for x in po["lines"] if x["material"]["id"] == f["fabric"]["id"])
    body = {"location_id": f["loc"]["id"], "lines": [{"item_id": fab_item["id"], "quantity": 10}]}
    assert client.post(f"{API}/purchase-orders/{po['id']}/receive", headers=o, json=body).status_code == 409
    dup = {"items": [{"material_id": f["fabric"]["id"], "quantity": 1, "unit_price": 1}] * 2}
    assert client.patch(f"{API}/purchase-orders/{po['id']}", headers=o, json=dup).status_code == 422

    assert client.post(f"{API}/purchase-orders/{po['id']}/submit", headers=o).json()["status"] == "ORDERED"
    # Yuborilgandan keyin qatorlar o'zgarmaydi
    assert client.patch(f"{API}/purchase-orders/{po['id']}", headers=o, json={"items": [{"material_id": f["fabric"]["id"], "quantity": 5, "unit_price": 1}]}).status_code == 409
    line = next(x for x in client.get(f"{API}/orders/{f['order']['id']}/materials", headers=o).json()["lines"] if x["material_id"] == f["fabric"]["id"])
    assert line["on_order"] == 30

    # Qisman qabul → ombor kirimi, tannarx yangilanadi, holat PARTIAL
    body = {"location_id": f["loc"]["id"], "document_no": "INV-77", "lines": [{"item_id": fab_item["id"], "quantity": 20}]}
    d = client.post(f"{API}/purchase-orders/{po['id']}/receive", headers=o, json=body).json()
    assert d["status"] == "PARTIAL" and d["receipts"][0]["document_no"] == "INV-77" and d["receipts"][0]["purchase_item_id"] == fab_item["id"]
    assert next(x for x in d["lines"] if x["id"] == fab_item["id"])["remaining"] == 10
    mat = client.get(f"{API}/inventory/materials/{f['fabric']['id']}", headers=o).json()
    assert mat["stock"] == 20 and mat["unit_cost"] == 32000
    # Buyurtmadan ortiq qabul qilinmaydi
    body["lines"][0]["quantity"] = 11
    r = client.post(f"{API}/purchase-orders/{po['id']}/receive", headers=o, json=body)
    assert r.status_code == 422 and "10" in r.json()["detail"]
    # Qisman kelganini bekor qilib bo'lmaydi, faqat yopiladi
    assert client.post(f"{API}/purchase-orders/{po['id']}/cancel", headers=o, json={}).status_code == 409

    thr_item = next(x for x in po["lines"] if x["material"]["id"] == f["thread"]["id"])
    body = {"location_id": f["loc"]["id"], "lines": [{"item_id": fab_item["id"], "quantity": 10}, {"item_id": thr_item["id"], "quantity": 100}]}
    d = client.post(f"{API}/purchase-orders/{po['id']}/receive", headers=o, json=body).json()
    assert d["status"] == "RECEIVED" and d["received_pct"] == 100

    s = client.get(f"{API}/suppliers/{sup['id']}", headers=o).json()
    assert s["stats"]["received_value"] == 30 * 32000 + 100 * 500 and s["stats"]["on_time_pct"] == 100
    assert client.delete(f"{API}/suppliers/{sup['id']}", headers=o).status_code == 409  # tarixi bor
    assert client.get(f"{API}/production/trace", headers=o, params={"code": "po-000001"}).json()["kind"] == "PURCHASE_ORDER"
    summary = client.get(f"{API}/procurement/summary", headers=o).json()
    assert summary["open_orders"] == 0 and summary["suppliers_count"] == 1


def test_finished_goods_and_shipments(client, f):
    o, post = f["owner"], f["post"]
    order = f["order"]
    wos = client.post(f"{API}/orders/{order['id']}/work-orders", headers=o, json={}).json()
    wo_m = next(w for w in wos if w["size"] == "M")
    for st in ("CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL", "PACKING"):
        assert client.post(f"{API}/production/work-orders/{wo_m['id']}/logs", headers=o, json={"stage": st, "quantity_good": 10}).status_code == 201

    # Qadoqlangandan ko'p omborga qabul qilinmaydi
    r = post("/finished-goods/receive", {"work_order_id": wo_m["id"], "location_id": f["fg"]["id"], "quantity": 11})
    assert r.status_code == 422 and "qadoqlangan 10" in r.json()["detail"]
    s = post("/finished-goods/receive", {"work_order_id": wo_m["id"], "location_id": f["fg"]["id"], "quantity": 10}).json()
    assert s == {"work_order_id": wo_m["id"], "packed": 10, "received": 10, "remaining": 0}
    stock = client.get(f"{API}/finished-goods/stock", headers=o).json()
    assert stock["total"] == 1 and stock["items"][0]["quantity"] == 10 and stock["items"][0]["size"] == "M" and stock["items"][0]["value"] == 1_000_000

    # L o'lcham omborda yo'q — inventarizatsiya bilan 5 dona topildi (sanoq natijasi)
    adj = post("/finished-goods/movements", {"movement_type": "ADJUSTMENT", "product_id": f["product"]["id"], "size": "L", "location_id": f["fg"]["id"], "quantity": 5})
    assert adj.status_code == 201 and adj.json()["quantity"] == 5
    # Mahsulotda yo'q o'lcham qabul qilinmaydi
    bad = post("/finished-goods/movements", {"movement_type": "RETURN", "product_id": f["product"]["id"], "size": "XXL", "location_id": f["fg"]["id"], "quantity": 1})
    assert bad.status_code == 422

    shipping = client.get(f"{API}/orders/{order['id']}/shipping", headers=o).json()
    m_line = next(x for x in shipping["lines"] if x["size"] == "M")
    l_line = next(x for x in shipping["lines"] if x["size"] == "L")
    assert m_line["in_stock"] == 10 and m_line["remaining"] == 10

    # Buyurtmadagidan ko'p jo'natilmaydi
    r = post("/shipments", {"order_id": order["id"], "items": [{"order_item_id": m_line["order_item_id"], "quantity": 11}]})
    assert r.status_code == 422
    sh1 = post("/shipments", {"order_id": order["id"], "carrier": "O'z transporti", "vehicle_no": "01A123BC",
                              "items": [{"order_item_id": m_line["order_item_id"], "quantity": 10}]}).json()
    assert sh1["number"] == "SH-000001" and sh1["status"] == "PREPARING" and sh1["lines"][0]["in_stock"] == 10
    # Tayyorlanayotgan jo'natmadagi miqdor band — ikkinchi jo'natmaga kirmaydi
    r = post("/shipments", {"order_id": order["id"], "items": [{"order_item_id": m_line["order_item_id"], "quantity": 1}]})
    assert r.status_code == 422

    d = client.post(f"{API}/shipments/{sh1['id']}/ship", headers=o, json={}).json()
    assert d["status"] == "SHIPPED" and d["lines"][0]["in_stock"] == 0
    assert client.get(f"{API}/orders/{order['id']}", headers=o).json()["status"] != "SHIPPED"  # L hali jo'natilmagan
    # Yo'lga chiqqandan keyin qatorlar o'zgarmaydi, transport ma'lumoti o'zgaradi; bekor qilinmaydi
    assert client.patch(f"{API}/shipments/{sh1['id']}", headers=o, json={"items": [{"order_item_id": m_line["order_item_id"], "quantity": 5}]}).status_code == 409
    assert client.patch(f"{API}/shipments/{sh1['id']}", headers=o, json={"tracking_no": "TRK-1"}).json()["tracking_no"] == "TRK-1"
    assert client.post(f"{API}/shipments/{sh1['id']}/cancel", headers=o).status_code == 409

    # Omborda yetmasa jo'natilmaydi (hammasi yoki hech biri)
    client.post(f"{API}/finished-goods/movements", headers=o, json={"movement_type": "WRITE_OFF", "product_id": f["product"]["id"], "size": "L", "location_id": f["fg"]["id"], "quantity": 1, "note": "shikast"})
    sh2 = post("/shipments", {"order_id": order["id"], "items": [{"order_item_id": l_line["order_item_id"], "quantity": 5}]}).json()
    r = client.post(f"{API}/shipments/{sh2['id']}/ship", headers=o, json={})
    assert r.status_code == 422 and "omborda 4" in r.json()["detail"]
    assert client.get(f"{API}/shipments/{sh2['id']}", headers=o).json()["status"] == "PREPARING"
    post("/finished-goods/movements", {"movement_type": "RETURN", "product_id": f["product"]["id"], "size": "L", "location_id": f["fg"]["id"], "quantity": 1})
    assert client.post(f"{API}/shipments/{sh2['id']}/ship", headers=o, json={}).json()["status"] == "SHIPPED"
    assert client.get(f"{API}/orders/{order['id']}", headers=o).json()["status"] == "SHIPPED"

    # Yetkazildi: to'lanmagan buyurtma "Jo'natildi"da qoladi; to'langandan keyin oxirgi yetkazish → "Yakunlandi"
    client.post(f"{API}/shipments/{sh1['id']}/deliver", headers=o, json={"received_by": "Akmal"})
    assert client.get(f"{API}/orders/{order['id']}", headers=o).json()["status"] == "SHIPPED"
    assert client.post(f"{API}/orders/{order['id']}/payment", headers=o).status_code == 200
    d = client.post(f"{API}/shipments/{sh2['id']}/deliver", headers=o, json={}).json()
    assert d["status"] == "DELIVERED"
    assert client.get(f"{API}/orders/{order['id']}", headers=o).json()["status"] == "COMPLETED"

    moves = client.get(f"{API}/finished-goods/movements", headers=o, params={"movement_type": "SHIPMENT"}).json()
    assert moves["total"] == 2 and {m["shipment_number"] for m in moves["items"]} == {"SH-000001", "SH-000002"}
    summary = client.get(f"{API}/finished-goods/summary", headers=o).json()
    assert summary["units"] == 0 and summary["received_30d"] == 10 and summary["shipped_30d"] == 15
    assert client.delete(f"{API}/products/{f['product']['id']}", headers=o).status_code == 409  # ombor tarixi bor
    assert client.get(f"{API}/production/trace", headers=o, params={"code": "SH-000002"}).json()["path"] == f"/shipments/{sh2['id']}"


def test_finished_goods_manual_receipt_and_transfer(client, f):
    o, post = f["owner"], f["post"]
    pid, fg, other = f["product"]["id"], f["fg"]["id"], f["loc"]["id"]
    move = lambda body: post("/finished-goods/movements", {"product_id": pid, "size": "M", **body})  # noqa: E731

    # Kirim: ish buyurtmasisiz (boshlang'ich qoldiq / tashqaridan kelgan)
    r = move({"movement_type": "RECEIPT", "location_id": fg, "quantity": 12, "note": "boshlang'ich qoldiq"})
    assert r.status_code == 201 and r.json()["movement_type"] == "RECEIPT" and r.json()["quantity"] == 12
    assert move({"movement_type": "RECEIPT", "location_id": fg, "quantity": 0}).status_code == 422

    # Ko'chirish: qoldiqdan ko'p emas, joy har xil, manzil majburiy
    assert move({"movement_type": "TRANSFER", "location_id": fg, "to_location_id": other, "quantity": 13}).status_code == 422
    assert move({"movement_type": "TRANSFER", "location_id": fg, "to_location_id": fg, "quantity": 1}).status_code == 422
    assert move({"movement_type": "TRANSFER", "location_id": fg, "quantity": 1}).status_code == 422
    r = move({"movement_type": "TRANSFER", "location_id": fg, "to_location_id": other, "quantity": 5})
    assert r.status_code == 201 and r.json()["movement_type"] == "TRANSFER_OUT" and r.json()["quantity"] == -5

    stock = client.get(f"{API}/finished-goods/stock", headers=o).json()["items"][0]
    assert stock["quantity"] == 12  # umumiy qoldiq o'zgarmaydi
    assert {loc["location"]["id"]: loc["quantity"] for loc in stock["locations"]} == {fg: 7, other: 5}
    types = [m["movement_type"] for m in client.get(f"{API}/finished-goods/movements", headers=o).json()["items"]]
    assert sorted(types) == ["RECEIPT", "TRANSFER_IN", "TRANSFER_OUT"]
    assert client.get(f"{API}/finished-goods/summary", headers=o).json()["received_30d"] == 12


def test_roles_and_isolation(client, f):
    o = f["owner"]
    sup = f["post"]("/suppliers", {"name": "Ip Savdo"}).json()
    other, _ = register_owner(client, "other@l.uz", "Boshqa")
    assert client.get(f"{API}/suppliers/{sup['id']}", headers=other).status_code == 404
    assert client.get(f"{API}/suppliers", headers=other).json()["total"] == 0
    assert client.post(f"{API}/purchase-orders", headers=other, json={"supplier_id": sup["id"], "items": [{"material_id": f["fabric"]["id"], "quantity": 1, "unit_price": 1}]}).status_code == 404

    quality = add_user(client, o, "q@l.uz", "QUALITY_MANAGER")
    assert client.get(f"{API}/purchase-orders", headers=quality).status_code == 200
    assert client.post(f"{API}/suppliers", headers=quality, json={"name": "X Savdo"}).status_code == 403
    assert client.post(f"{API}/shipments", headers=quality, json={"order_id": f["order"]["id"], "items": [{"order_item_id": 1, "quantity": 1}]}).status_code == 403
    worker = add_user(client, o, "w@l.uz", "WORKER")
    assert client.get(f"{API}/finished-goods/stock", headers=worker).status_code == 403
    production = add_user(client, o, "p@l.uz", "PRODUCTION_MANAGER")
    # Ishlab chiqarish rahbari omborga topshira oladi, lekin qo'lda tuzatish qila olmaydi
    r = client.post(f"{API}/finished-goods/receive", headers=production, json={"work_order_id": 999, "location_id": f["fg"]["id"], "quantity": 1})
    assert r.status_code == 404
    r = client.post(f"{API}/finished-goods/movements", headers=production, json={"movement_type": "RETURN", "product_id": f["product"]["id"], "size": "M", "location_id": f["fg"]["id"], "quantity": 1})
    assert r.status_code == 403
