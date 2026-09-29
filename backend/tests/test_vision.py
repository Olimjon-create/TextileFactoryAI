"""7-bosqich: AI / Computer Vision — qurilma kaliti, hodisalar, qoidalar, tasdiqlash, mavjud tizimga qo'llash."""

import pytest

from tests.conftest import API, add_user, register_owner

V = f"{API}/vision"


@pytest.fixture()
def f(client):
    owner, _ = register_owner(client, "owner@v.uz", "Vision Tekstil")
    post = lambda url, body=None: client.post(f"{API}{url}", headers=owner, json=body or {})  # noqa: E731
    product = post("/products", {"name": "Polo", "code": "PL", "category": "Polo", "status": "ACTIVE", "price": 1000}).json()
    wo = post("/production/work-orders", {"product_id": product["id"], "quantity": 20}).json()
    machine = post("/machines", {"code": "JK1", "name": "Juki", "machine_type": "LOCKSTITCH"}).json()
    post(f"/machines/{machine['id']}/status", {"status": "WORKING"})
    emp = post("/employees", {"full_name": "Dilnoza", "department": "CUTTING"}).json()
    r = post("/vision/devices", {"code": "cam-01", "name": "Kesish kamerasi", "kind": "CAMERA", "stage": "CUTTING"})
    assert r.status_code == 201, r.text
    cam = r.json()
    return {"owner": owner, "post": post, "wo": wo, "machine": machine, "cam": cam, "emp": emp}


def send(client, key, *events):
    return client.post(f"{V}/ingest", headers={"X-Device-Key": key} if key else {}, json={"events": list(events)})


def test_device_key_and_heartbeat(client, f):
    cam = f["cam"]
    assert cam["code"] == "CAM-01" and cam["api_key"].startswith("tfd_") and cam["online"] is False
    listed = client.get(f"{V}/devices", headers=f["owner"]).json()
    assert "api_key" not in listed[0] and listed[0]["key_prefix"] == cam["api_key"][:12]
    assert send(client, "tfd_wrong").status_code == 401
    assert send(client, None).status_code == 401
    r = send(client, cam["api_key"])  # bo'sh — heartbeat
    assert r.status_code == 200 and r.json()["accepted"] == 0
    assert client.get(f"{V}/devices/{cam['id']}", headers=f["owner"]).json()["online"] is True
    # Kalit almashtirilsa eskisi ishlamaydi
    new = client.post(f"{V}/devices/{cam['id']}/rotate-key", headers=f["owner"]).json()["api_key"]
    assert send(client, cam["api_key"]).status_code == 401 and send(client, new).status_code == 200
    client.patch(f"{V}/devices/{cam['id']}", headers=f["owner"], json={"is_active": False})
    assert send(client, new).status_code == 403


def test_review_flow_default_rule(client, f):
    key = f["cam"]["api_key"]
    # Qoida yo'q — odam tasdiqlaydi; ish buyurtmasi qurilmaga biriktirilmagan
    res = send(client, key, {"event_type": "COUNT", "external_id": "e1", "quantity": 12, "confidence": 0.99}).json()["results"][0]
    assert res["status"] == "PENDING" and "tasdiqlash" in res["message"]
    ev = client.get(f"{V}/events", headers=f["owner"], params={"status": "PENDING"}).json()["items"][0]
    # Tasdiqlashda ish buyurtmasi aniqlanmasa — tushunarli xato
    assert client.post(f"{V}/events/{ev['id']}/apply", headers=f["owner"], json={}).status_code == 422
    r = client.post(f"{V}/events/{ev['id']}/apply", headers=f["owner"], json={"work_order_id": f["wo"]["id"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "APPLIED" and d["production_log_id"] and d["reviewed_by_name"] == "Owner"
    wo = client.get(f"{API}/production/work-orders/{f['wo']['id']}", headers=f["owner"]).json()
    log = wo["logs"][0]
    assert log["source"] == "CAMERA" and log["quantity_good"] == 12 and log["stage"] == "CUTTING"
    # Qayta tasdiqlanmaydi; rad etish faqat kutilayotganga
    assert client.post(f"{V}/events/{ev['id']}/apply", headers=f["owner"], json={}).status_code == 409
    res = send(client, key, {"event_type": "COUNT", "external_id": "e2", "quantity": 3}).json()["results"][0]
    r = client.post(f"{V}/events/{res['event_id']}/reject", headers=f["owner"], json={"reason": "noto'g'ri sanoq"}).json()
    assert r["status"] == "REJECTED" and "noto'g'ri" in r["status_message"]


def test_auto_apply_rules(client, f):
    o, key, cam = f["owner"], f["cam"]["api_key"], f["cam"]
    client.patch(f"{V}/devices/{cam['id']}", headers=o, json={"work_order_id": f["wo"]["id"], "machine_id": f["machine"]["id"]})
    for et in ("COUNT", "DEFECT", "MACHINE_STATE"):
        assert f["post"]("/vision/rules", {"event_type": et, "action": "AUTO_APPLY", "min_confidence": 0.8}).status_code == 201
    assert f["post"]("/vision/rules", {"event_type": "COUNT", "action": "REVIEW"}).status_code == 409  # bir xil qamrov

    results = send(
        client, key,
        {"event_type": "COUNT", "external_id": "a1", "quantity": 10, "confidence": 0.95, "employee_code": f["emp"]["employee_code"]},
        {"event_type": "COUNT", "external_id": "a2", "quantity": 5, "confidence": 0.5},  # past ishonch
        {"event_type": "DEFECT", "external_id": "a3", "quantity": 1, "confidence": 0.9, "defect_reason": "Mato teshik"},
        {"event_type": "COUNT", "external_id": "a4", "quantity": 50, "confidence": 0.99},  # rejadan oshadi
        {"event_type": "MACHINE_STATE", "external_id": "a5", "machine_state": "BROKEN", "confidence": 0.97},
        {"event_type": "CUSTOM", "external_id": "a6", "data": {"ppe": "no_gloves"}},
    ).json()["results"]
    st = [r["status"] for r in results]
    assert st == ["APPLIED", "PENDING", "APPLIED", "PENDING", "APPLIED", "STORED"], results
    assert "Ishonch past" in results[1]["message"] and "Qo'llanmadi" in results[3]["message"]

    # Qayta yuborish — ikki marta yozilmaydi
    dup = send(client, key, {"event_type": "COUNT", "external_id": "a1", "quantity": 10, "confidence": 0.95}).json()["results"][0]
    assert dup["duplicate"] is True
    wo = client.get(f"{API}/production/work-orders/{f['wo']['id']}", headers=o).json()
    cut = next(p for p in wo["progress"] if p["stage"] == "CUTTING")
    assert cut["good"] == 10 and cut["defect"] == 1 and wo["status"] == "IN_PROGRESS"
    assert any(log["employee"] and log["employee"]["name"] == "Dilnoza" for log in wo["logs"])
    assert client.get(f"{API}/machines/{f['machine']['id']}", headers=o).json()["status"] == "BROKEN"
    # Mashina buzilgach, kamera sanog'i ham mavjud qoidaga ko'ra rad etiladi (buzilgan mashinaga yozilmaydi)
    r = send(client, key, {"event_type": "COUNT", "external_id": "a7", "quantity": 1, "confidence": 0.99}).json()["results"][0]
    assert r["status"] == "PENDING"

    s = client.get(f"{V}/summary", headers=o).json()
    assert s["counted_today"] == 10 and s["defects_today"] == 1 and s["pending"] == 3 and s["online"] == 1
    audit = client.get(f"{API}/audit-logs", headers=o, params={"search": "Qurilma CAM-01"}).json()
    assert audit["total"] >= 1


def test_alert_rule_notification_and_isolation(client, f):
    o, key = f["owner"], f["cam"]["api_key"]
    f["post"]("/vision/rules", {"event_type": "DEFECT", "action": "STORE_ONLY", "alert_threshold": 5, "alert_window_minutes": 60})
    send(client, key, {"event_type": "DEFECT", "external_id": "d1", "quantity": 3}, {"event_type": "DEFECT", "external_id": "d2", "quantity": 3})
    keys = [n["key"] for n in client.get(f"{API}/notifications", headers=o).json()["items"]]
    assert any(k.startswith("vision-alert:") for k in keys)

    other, _ = register_owner(client, "other@v.uz", "Boshqa")
    assert client.get(f"{V}/devices", headers=other).json() == []
    assert client.get(f"{V}/events", headers=other).json()["total"] == 0
    assert client.get(f"{V}/devices/{f['cam']['id']}", headers=other).status_code == 404
    # Boshqa fabrikaning WO raqami bilan — topilmaydi (qurilma faqat o'z fabrikasiga yozadi)
    op = lambda url, b: client.post(f"{API}{url}", headers=other, json=b)  # noqa: E731
    p2 = op("/products", {"name": "Futbolka", "code": "T1", "category": "Futbolka", "status": "ACTIVE", "price": 1000}).json()
    wo2 = op("/production/work-orders", {"product_id": p2["id"], "quantity": 5}).json()
    f["post"]("/vision/rules", {"event_type": "COUNT", "action": "AUTO_APPLY", "min_confidence": 0})
    # WO raqamlari fabrika ichida: bir xil raqam — qurilmaning O'Z fabrikasidagi ish buyurtmasi
    assert wo2["number"] == f["wo"]["number"]
    r = send(client, key, {"event_type": "COUNT", "external_id": "x1", "quantity": 1, "work_order": wo2["number"]}).json()["results"][0]
    assert r["status"] == "APPLIED" and r["message"].startswith(f["wo"]["number"])
    r = send(client, key, {"event_type": "COUNT", "external_id": "x2", "quantity": 1, "work_order": "WO-999999"}).json()["results"][0]
    assert r["status"] == "PENDING" and "topilmadi" in r["message"]
    assert client.get(f"{API}/production/work-orders/{wo2['id']}", headers=other).json()["logs"] == []

    worker = add_user(client, o, "w@v.uz", "WORKER")
    assert client.get(f"{V}/devices", headers=worker).status_code == 403
    q = add_user(client, o, "q@v.uz", "QUALITY_MANAGER")
    assert client.get(f"{V}/events", headers=q).status_code == 200
    assert client.post(f"{V}/devices", headers=q, json={"code": "X", "name": "X kamera", "kind": "CAMERA"}).status_code == 403
