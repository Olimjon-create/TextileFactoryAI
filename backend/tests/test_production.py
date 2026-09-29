"""4-bosqich: ish buyurtmalari, bosqich nazorati, buyurtma holati avtomatikasi, mato sarfi, partiya/quti, kuzatuv, KPI."""

from datetime import date, timedelta

import pytest

from tests.conftest import API, add_user, register_owner

PROD = f"{API}/production"


@pytest.fixture()
def f(client):
    owner, factory_id = register_owner(client, "owner@p.uz", "Ishlab Tekstil")
    post = lambda url, body: client.post(f"{API}{url}", headers=owner, json=body)  # noqa: E731
    fabric = post("/inventory/materials", {"code": "FAB", "name": "Pike", "material_type": "FABRIC", "unit": "METER"}).json()
    product = post("/products", {"name": "Polo", "code": "PL-1", "category": "Polo", "status": "ACTIVE", "price": 100000, "sizes": ["M", "L"]}).json()
    post(f"/products/{product['id']}/bom", {"material_id": fabric["id"], "material_type": "FABRIC", "material_name": "katalogdan", "quantity": 1.2, "unit": "METER", "waste_percent": 10})
    line = post("/production-lines", {"code": "TK-1", "name": "Tikuv", "stage": "SEWING"}).json()
    shift = post("/shifts", {"name": "Kunduzgi", "start_time": "08:00", "end_time": "17:00", "break_minutes": 60}).json()
    emp = post("/employees", {"full_name": "Dilnoza", "department": "SEWING", "line_id": line["id"], "shift_id": shift["id"], "daily_norm": 50}).json()
    machine = post("/machines", {"code": "JK-1", "name": "Juki", "machine_type": "LOCKSTITCH", "line_id": line["id"]}).json()
    post(f"/machines/{machine['id']}/status", {"status": "WORKING"})
    customer = post("/customers", {"name": "Baraka", "customer_type": "COMPANY", "status": "ACTIVE", "phone": "+998901234567", "country": "UZ"}).json()
    due = (date.today() + timedelta(days=10)).isoformat()
    order = post("/orders", {"customer_id": customer["id"], "due_date": due, "items": [{"product_id": product["id"], "quantity": 100, "size": "M"}]}).json()
    return {"owner": owner, "post": post, "product": product, "line": line, "emp": emp, "machine": machine, "order": order, "shift": shift}


def log(client, f, wo_id, **body):
    return client.post(f"{PROD}/work-orders/{wo_id}/logs", headers=f["owner"], json=body)


def stage(wo, name):
    return next(p for p in wo["progress"] if p["stage"] == name)


def test_order_to_work_orders_and_stage_guard(client, f):
    o = f["owner"]
    r = client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={"line_id": f["line"]["id"]})
    assert r.status_code == 201, r.text
    wo = r.json()[0]
    assert wo["number"] == "WO-000001" and wo["quantity"] == 100 and wo["size"] == "M"
    assert wo["planned_end"] == f["order"]["due_date"] and wo["order_number"] == f["order"]["order_number"]
    assert client.get(f"{API}/orders/{f['order']['id']}", headers=o).json()["status"] == "CONFIRMED"
    assert client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={}).status_code == 409  # hammasi rejalashtirilgan

    # Brak sababsiz qayd etilmaydi; kesish boshlanishi → buyurtma "Ishlab chiqarishda"
    assert log(client, f, wo["id"], stage="CUTTING", quantity_good=60, quantity_defect=2).status_code == 422
    d = log(client, f, wo["id"], stage="CUTTING", quantity_good=60, quantity_defect=2, defect_reason="Mato dog'li", fabric_used=75, fabric_waste=5).json()
    assert d["status"] == "IN_PROGRESS" and d["current_stage"] == "CUTTING"
    assert client.get(f"{API}/orders/{f['order']['id']}", headers=o).json()["status"] == "IN_PRODUCTION"

    # Tikuv kesilgan yaroqlidan (60) ko'p ishlay olmaydi; pardozsiz sifat nazorati bo'lmaydi
    r = log(client, f, wo["id"], stage="SEWING", quantity_good=61)
    assert r.status_code == 422 and "60" in r.json()["detail"]
    assert log(client, f, wo["id"], stage="SEWING", quantity_good=58, quantity_defect=2, defect_reason="Chok qiyshiq", employee_id=f["emp"]["id"], machine_id=f["machine"]["id"]).status_code == 201
    assert log(client, f, wo["id"], stage="QUALITY_CONTROL", quantity_good=1).status_code == 422
    # Kesish rejadan oshmaydi (100): 62 ishlangan → yana 38
    assert log(client, f, wo["id"], stage="CUTTING", quantity_good=39).status_code == 422
    d = log(client, f, wo["id"], stage="CUTTING", quantity_good=38).json()
    assert stage(d, "CUTTING")["remaining"] == 0 and stage(d, "SEWING")["available"] == 98
    sewing_log = next(x for x in d["logs"] if x["stage"] == "SEWING")
    assert sewing_log["line"]["code"] == "TK-1" and sewing_log["shift"]["name"] == "Kunduzgi"  # xodimdan avtomatik
    assert d["current_stage"] == "SEWING"

    # Mato sarfi: reja 100 × 1.2 × 1.1 = 132; haqiqiy 75, chiqindi 5
    assert d["fabric"]["planned"] == pytest.approx(132) and d["fabric"]["used"] == 75 and d["fabric"]["waste_pct"] == pytest.approx(6.7)
    assert d["fabric"]["per_piece_planned"] == pytest.approx(1.32)


def test_auto_complete_and_order_ready(client, f):
    o = f["owner"]
    wo = client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={}).json()[0]
    client.patch(f"{PROD}/work-orders/{wo['id']}", headers=o, json={"quantity": 100, "overcut_pct": 10})
    for st, good, defect in (("CUTTING", 110, 0), ("SEWING", 108, 2), ("FINISHING", 108, 0), ("QUALITY_CONTROL", 101, 7), ("PACKING", 100, 0)):
        r = log(client, f, wo["id"], stage=st, quantity_good=good, quantity_defect=defect, defect_reason="brak" if defect else None)
        assert r.status_code == 201, (st, r.text)
    d = r.json()
    assert d["status"] == "COMPLETED" and d["percent"] == 100 and d["finished"] == 100 and d["current_stage"] is None
    assert stage(d, "QUALITY_CONTROL")["defect_rate"] == pytest.approx(6.5)
    assert client.get(f"{API}/orders/{f['order']['id']}", headers=o).json()["status"] == "READY"
    # Yopilgan ish buyurtmasiga yozib bo'lmaydi
    assert log(client, f, wo["id"], stage="PACKING", quantity_good=1).status_code == 409


def test_manual_complete_cancel_and_delete_log(client, f):
    o = f["owner"]
    wo = client.post(f"{PROD}/work-orders", headers=o, json={"product_id": f["product"]["id"], "quantity": 20, "size": "L"}).json()
    assert wo["order_id"] is None and wo["status"] == "PLANNED"
    assert client.post(f"{PROD}/work-orders/{wo['id']}/complete", headers=o).status_code == 409  # hech narsa qadoqlanmagan
    cut = log(client, f, wo["id"], stage="CUTTING", quantity_good=20).json()
    log(client, f, wo["id"], stage="SEWING", quantity_good=15)
    cut_id = next(x["id"] for x in client.get(f"{PROD}/work-orders/{wo['id']}", headers=o).json()["logs"] if x["stage"] == "CUTTING")
    sew_id = next(x["id"] for x in client.get(f"{PROD}/work-orders/{wo['id']}", headers=o).json()["logs"] if x["stage"] == "SEWING")
    assert cut["status"] == "IN_PROGRESS"
    assert client.delete(f"{PROD}/logs/{cut_id}", headers=o).status_code == 409  # tikuv unga tayangan
    assert client.delete(f"{PROD}/logs/{sew_id}", headers=o).status_code == 200
    assert client.delete(f"{PROD}/logs/{cut_id}", headers=o).status_code == 200
    d = client.post(f"{PROD}/work-orders/{wo['id']}/cancel", headers=o).json()
    assert d["status"] == "CANCELLED"
    # Variant noto'g'ri bo'lsa ish buyurtmasi ochilmaydi
    assert client.post(f"{PROD}/work-orders", headers=o, json={"product_id": f["product"]["id"], "quantity": 5}).status_code == 422


def test_units_and_trace(client, f):
    o = f["owner"]
    wo = client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={}).json()[0]
    log(client, f, wo["id"], stage="CUTTING", quantity_good=50)
    u = f"{PROD}/work-orders/{wo['id']}/units"
    assert client.post(u, headers=o, json={"kind": "BUNDLE", "quantity": 51}).status_code == 422
    d = client.post(u, headers=o, json={"kind": "BUNDLE", "quantity": 25}).json()
    client.post(u, headers=o, json={"kind": "BUNDLE", "quantity": 25})
    assert [x["code"] for x in client.get(f"{PROD}/work-orders/{wo['id']}", headers=o).json()["units"]] == ["WO-000001-P01", "WO-000001-P02"]
    assert client.post(u, headers=o, json={"kind": "BOX", "quantity": 1}).status_code == 422  # sifatdan hali hech narsa o'tmagan
    assert client.post(u, headers=o, json={"kind": "BUNDLE", "quantity": 1}).status_code == 422  # 50 tasi ham ajratilgan
    assert d["units"][0]["size"] == "M"

    # Skanerdan partiya kodi bilan tikuv yozuvi
    assert log(client, f, wo["id"], stage="SEWING", quantity_good=25, unit_code="wo-000001-p01", source="SCANNER").status_code == 201
    t = client.get(f"{PROD}/trace", headers=o, params={"code": "WO-000001-P01"}).json()
    assert t["kind"] == "BUNDLE" and t["unit"]["stages_done"] == ["CUTTING", "SEWING"] and t["logs"][0]["source"] == "SCANNER"
    assert t["path"] == f"/production/{wo['id']}"
    assert client.get(f"{PROD}/trace", headers=o, params={"code": "wo-000001"}).json()["kind"] == "WORK_ORDER"
    assert client.get(f"{PROD}/trace", headers=o, params={"code": f["order"]["order_number"]}).json()["kind"] == "ORDER"
    assert client.get(f"{PROD}/trace", headers=o, params={"code": "JK-1"}).json()["kind"] == "MACHINE"
    assert client.get(f"{PROD}/trace", headers=o, params={"code": "FAB"}).json()["kind"] == "MATERIAL"
    assert client.get(f"{PROD}/trace", headers=o, params={"code": "YOQ-123"}).status_code == 404
    # Boshqa zavodning kodi topilmaydi
    other, _ = register_owner(client, "x@p.uz", "Boshqa")
    assert client.get(f"{PROD}/trace", headers=other, params={"code": "WO-000001-P01"}).status_code == 404


def test_employee_kpi_and_summary(client, f):
    o = f["owner"]
    wo = client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={}).json()[0]
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    log(client, f, wo["id"], stage="CUTTING", quantity_good=100, fabric_used=120, fabric_waste=6)
    log(client, f, wo["id"], stage="SEWING", quantity_good=40, employee_id=f["emp"]["id"], work_date=yesterday, duration_minutes=480)
    log(client, f, wo["id"], stage="SEWING", quantity_good=45, quantity_defect=5, defect_reason="chok", employee_id=f["emp"]["id"], duration_minutes=480)
    assert log(client, f, wo["id"], stage="SEWING", quantity_good=1, work_date=(date.today() + timedelta(days=1)).isoformat()).status_code == 422

    kpi = client.get(f"{PROD}/kpi/employees", headers=o).json()
    k = kpi[0]
    assert (k["days_worked"], k["good"], k["defect"], k["norm_total"]) == (2, 85, 5, 100)
    assert k["efficiency_pct"] == 85.0 and k["defect_rate"] == pytest.approx(5.6) and k["per_hour"] == pytest.approx(5.3)
    s = client.get(f"{PROD}/summary", headers=o).json()
    assert s["work_orders_active"] == 1 and s["fabric_used_30d"] == 120 and s["waste_pct_30d"] == 5.0
    today_sewing = next(x for x in s["output_today"] if x["stage"] == "SEWING")
    week_sewing = next(x for x in s["output_7d"] if x["stage"] == "SEWING")
    assert today_sewing["good"] == 45 and week_sewing["good"] == 85


def test_guards_and_roles(client, f):
    o = f["owner"]
    wo = client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={}).json()[0]
    log(client, f, wo["id"], stage="CUTTING", quantity_good=10)
    # Mato sarfi faqat kesishda; buzilgan mashinada ish yozilmaydi
    assert log(client, f, wo["id"], stage="SEWING", quantity_good=1, fabric_used=1).status_code == 422
    client.post(f"{API}/machines/{f['machine']['id']}/status", headers=o, json={"status": "BROKEN", "reason": "motor"})
    assert log(client, f, wo["id"], stage="SEWING", quantity_good=1, machine_id=f["machine"]["id"]).status_code == 409

    quality = add_user(client, o, "q@p.uz", "QUALITY_MANAGER")
    keeper = add_user(client, o, "k@p.uz", "WAREHOUSE_MANAGER")
    worker = add_user(client, o, "w@p.uz", "WORKER")
    assert client.post(f"{PROD}/work-orders/{wo['id']}/logs", headers=quality, json={"stage": "SEWING", "quantity_good": 1}).status_code == 403
    log(client, f, wo["id"], stage="SEWING", quantity_good=10)
    log(client, f, wo["id"], stage="FINISHING", quantity_good=10)
    assert client.post(f"{PROD}/work-orders/{wo['id']}/logs", headers=quality, json={"stage": "QUALITY_CONTROL", "quantity_good": 9, "quantity_defect": 1, "defect_reason": "dog'"}).status_code == 201
    assert client.get(f"{PROD}/work-orders", headers=keeper).status_code == 200
    assert client.post(f"{PROD}/work-orders", headers=keeper, json={"product_id": f["product"]["id"], "quantity": 1, "size": "M"}).status_code == 403
    assert client.get(f"{PROD}/work-orders", headers=worker).status_code == 403
    assert client.get(f"{PROD}/kpi/employees", headers=quality).status_code == 403

    other, _ = register_owner(client, "o2@p.uz", "Ikkinchi")
    assert client.get(f"{PROD}/work-orders/{wo['id']}", headers=other).status_code == 404
    assert client.get(f"{PROD}/work-orders", headers=other).json()["total"] == 0
    # Filtrlar
    assert client.get(f"{PROD}/work-orders", headers=o, params={"active": True}).json()["total"] == 1
    assert client.get(f"{PROD}/work-orders", headers=o, params={"search": f["order"]["order_number"]}).json()["total"] == 1
