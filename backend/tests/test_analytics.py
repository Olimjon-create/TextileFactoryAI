"""6-bosqich: tannarx (material, ish haqi, ustama), sozlamalar, rahbar dashboardi, hisobotlar, bildirishnomalar."""

from datetime import date, timedelta

import pytest

from tests.conftest import API, add_user, register_owner


@pytest.fixture()
def f(client):
    owner, factory_id = register_owner(client, "owner@an.uz", "Tahlil Tekstil")
    post = lambda url, body=None: client.post(f"{API}{url}", headers=owner, json=body or {})  # noqa: E731
    fab = post("/inventory/materials", {"code": "FAB", "name": "Pike", "material_type": "FABRIC", "unit": "METER", "min_stock": 50}).json()
    loc = post("/inventory/locations", {"code": "A", "name": "Ombor"}).json()
    post("/inventory/movements", {"movement_type": "RECEIPT", "material_id": fab["id"], "location_id": loc["id"], "quantity": 100, "unit_cost": 20000})
    product = post("/products", {"name": "Polo", "code": "PL", "category": "Polo", "status": "ACTIVE", "price": 100000}).json()
    post(f"/products/{product['id']}/bom", {"material_id": fab["id"], "material_type": "FABRIC", "material_name": "katalogdan", "quantity": 1.5, "unit": "METER", "waste_percent": 0})
    customer = post("/customers", {"name": "Baraka", "customer_type": "COMPANY", "status": "ACTIVE", "phone": "+998901234567"}).json()
    order = post("/orders", {"customer_id": customer["id"], "due_date": (date.today() + timedelta(days=5)).isoformat(),
                             "items": [{"product_id": product["id"], "quantity": 10}]}).json()
    piece = post("/employees", {"full_name": "Ishbay Tikuvchi", "department": "SEWING", "pay_type": "PIECE", "pay_rate": 3000}).json()
    hourly = post("/employees", {"full_name": "Soatbay Bichuvchi", "department": "CUTTING", "pay_type": "HOURLY", "pay_rate": 12000}).json()
    monthly = post("/employees", {"full_name": "Oylik Nazoratchi", "department": "QUALITY_CONTROL", "pay_type": "MONTHLY", "pay_rate": 4160000}).json()
    return {"owner": owner, "post": post, "fab": fab, "loc": loc, "order": order, "product": product,
            "piece": piece, "hourly": hourly, "monthly": monthly, "factory_id": factory_id}


def test_order_costing(client, f):
    o, post, order = f["owner"], f["post"], f["order"]
    # Material: 15 m × 20 000 = 300 000; keyin narx oshsa ham chiqim o'sha paytdagi narxda qoladi
    assert client.post(f"{API}/orders/{order['id']}/materials/issue", headers=o, json={"lines": [{"material_id": f["fab"]["id"], "quantity": 15}]}).status_code == 200
    post("/inventory/movements", {"movement_type": "RECEIPT", "material_id": f["fab"]["id"], "location_id": f["loc"]["id"], "quantity": 10, "unit_cost": 99000})
    wo = client.post(f"{API}/orders/{order['id']}/work-orders", headers=o, json={}).json()[0]
    log = lambda **b: post(f"/production/work-orders/{wo['id']}/logs", b)  # noqa: E731
    log(stage="CUTTING", quantity_good=10, employee_id=f["hourly"]["id"], duration_minutes=90)  # 1.5 soat × 12 000 = 18 000
    log(stage="SEWING", quantity_good=10, employee_id=f["piece"]["id"])  # 10 × 3 000 = 30 000
    log(stage="FINISHING", quantity_good=10)  # xodimsiz — ogohlantirish
    log(stage="QUALITY_CONTROL", quantity_good=10, employee_id=f["monthly"]["id"], duration_minutes=60)  # 4 160 000 / 208 = 20 000
    log(stage="PACKING", quantity_good=10)

    c = client.get(f"{API}/orders/{order['id']}/costing", headers=o).json()
    assert c["material_actual"] == 300000 and c["material_planned"] == 15 * 99000  # reja — joriy narx bilan
    assert c["labor"] == 68000 and c["overhead"] == 0 and c["total_cost"] == 368000
    assert c["revenue"] == 1_000_000 and c["margin"] == 632000 and c["margin_pct"] == 63.2
    assert c["produced_qty"] == 10 and c["cost_per_unit"] == 36800
    assert any("xodim" in w for w in c["warnings"])

    # Ustama foizi — fabrika sozlamasidan
    assert client.get(f"{API}/settings/factory", headers=o).json()["overhead_percent"] == 0
    s = client.put(f"{API}/settings/factory", headers=o, json={"overhead_percent": 10, "low_margin_percent": 70}).json()
    assert s["overhead_percent"] == 10 and s["monthly_work_hours"] == 208
    c = client.get(f"{API}/orders/{order['id']}/costing", headers=o).json()
    assert c["overhead"] == 36800 and c["total_cost"] == 404800 and c["low_margin"] is True

    # Ish haqi maxfiy — tannarxni ishlab chiqarish rahbari ko'rmaydi
    pm = add_user(client, o, "pm@an.uz", "PRODUCTION_MANAGER")
    assert client.get(f"{API}/orders/{order['id']}/costing", headers=pm).status_code == 403
    assert client.put(f"{API}/settings/factory", headers=pm, json={"overhead_percent": 1}).status_code == 403

    rep = client.get(f"{API}/reports/costing", headers=o).json()
    row = rep["rows"][0]
    assert row["total"] == 404800 and row["margin"] == 595200 and rep["totals"]["revenue"] == 1_000_000


def test_dashboard_overview_by_role(client, f):
    o = f["owner"]
    ov = client.get(f"{API}/dashboard/overview", headers=o).json()
    assert ov["sales"]["open_orders"] == 1 and ov["sales"]["due_7d"] == 1 and len(ov["sales"]["revenue_by_day"]) == 14
    assert ov["production"] is not None and ov["inventory"]["materials_count"] == 1 and ov["material_issued_30d"] == 0
    w = add_user(client, o, "w@an.uz", "WORKER")
    ov = client.get(f"{API}/dashboard/overview", headers=w).json()
    assert all(ov[k] is None for k in ("sales", "production", "inventory", "procurement", "finished_goods", "resources", "material_issued_30d"))
    q = add_user(client, o, "q@an.uz", "QUALITY_MANAGER")
    ov = client.get(f"{API}/dashboard/overview", headers=q).json()
    assert ov["sales"] is None and ov["production"] is not None and ov["material_issued_30d"] is None


def test_reports(client, f):
    o = f["owner"]
    kinds = [r["kind"] for r in client.get(f"{API}/reports", headers=o).json()]
    assert set(kinds) == {"production", "defects", "employees", "sales", "costing", "inventory", "suppliers"}
    for kind in kinds:
        r = client.get(f"{API}/reports/{kind}", headers=o)
        assert r.status_code == 200, (kind, r.text)
        assert r.json()["columns"]
    sales = client.get(f"{API}/reports/sales", headers=o).json()
    assert sales["rows"][0]["amount"] == 1_000_000 and sales["totals"]["quantity"] == 10
    inv = client.get(f"{API}/reports/inventory", headers=o).json()
    assert inv["rows"][0]["value"] == 2_000_000
    assert client.get(f"{API}/reports/sales", headers=o, params={"date_from": "2026-02-01", "date_to": "2026-01-01"}).status_code == 422
    w = add_user(client, o, "w2@an.uz", "WORKER")
    assert client.get(f"{API}/reports", headers=w).json() == []
    assert client.get(f"{API}/reports/sales", headers=w).status_code == 403
    other, _ = register_owner(client, "other@an.uz", "Boshqa")
    assert client.get(f"{API}/reports/sales", headers=other).json()["rows"] == []


def test_notifications(client, f):
    o, post = f["owner"], f["post"]
    # Material kam (100 − 0 > 50 — hali yetarli); 60 chiqarilsa → 40 ≤ 50
    client.post(f"{API}/orders/{f['order']['id']}/materials/issue", headers=o, json={"lines": [{"material_id": f["fab"]["id"], "quantity": 60}]})
    m = post("/machines", {"code": "JK1", "name": "Juki", "machine_type": "LOCKSTITCH"}).json()
    post(f"/machines/{m['id']}/status", {"status": "BROKEN", "reason": "motor"})
    n = client.get(f"{API}/notifications", headers=o).json()
    keys = {x["key"] for x in n["items"]}
    assert f"low-stock:{f['fab']['id']}" in keys and f"machine-broken:{m['id']}" in keys and f"new-order:{f['order']['id']}" in keys
    assert n["unread"] == len(n["items"])
    n = client.post(f"{API}/notifications/read", headers=o, json={"keys": [f"machine-broken:{m['id']}"]}).json()
    assert n["unread"] == len(n["items"]) - 1
    assert next(x for x in n["items"] if x["key"] == f"machine-broken:{m['id']}")["read"] is True
    assert client.post(f"{API}/notifications/read-all", headers=o).json()["unread"] == 0
    # Boshqa foydalanuvchining o'qilgan holati alohida; ishchi ogohlantirish olmaydi
    w = add_user(client, o, "w3@an.uz", "WORKER")
    assert client.get(f"{API}/notifications", headers=w).json() == {"items": [], "unread": 0}
