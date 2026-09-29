"""3-bosqich: liniyalar, smenalar, xodimlar (maosh maxfiyligi), mashinalar (holat tarixi, downtime, texnik xizmat)."""

from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import MachineStatusLog
from tests.conftest import ADMIN_EMAIL, API, add_user, auth, register_owner


@pytest.fixture()
def fx(client):
    owner, factory_id = register_owner(client, "owner@r.uz", "Resurs Tekstil")
    post = lambda url, body: client.post(f"{API}{url}", headers=owner, json=body)  # noqa: E731
    line = post("/production-lines", {"code": "tk-1", "name": "Tikuv-1", "stage": "SEWING", "capacity_per_shift": 800}).json()
    day = post("/shifts", {"name": "Kunduzgi", "start_time": "08:00", "end_time": "17:00", "break_minutes": 60}).json()
    return {"owner": owner, "factory_id": factory_id, "post": post, "line": line, "day": day}


def test_lines_and_shifts(client, fx):
    assert fx["line"]["code"] == "TK-1"
    assert fx["post"]("/production-lines", {"code": "TK-1", "name": "Takror", "stage": "SEWING"}).status_code == 409
    assert fx["day"]["work_minutes"] == 480 and fx["day"]["is_night"] is False
    night = fx["post"]("/shifts", {"name": "Tungi", "start_time": "22:00", "end_time": "06:00", "break_minutes": 30}).json()
    assert night["work_minutes"] == 450 and night["is_night"] is True
    assert fx["post"]("/shifts", {"name": "Xato", "start_time": "08:00", "end_time": "08:00"}).status_code == 422
    assert fx["post"]("/shifts", {"name": "Xato", "start_time": "08:00", "end_time": "09:00", "break_minutes": 90}).status_code == 422


def test_employees_codes_links_and_pay_privacy(client, fx):
    o, post = fx["owner"], fx["post"]
    body = {"full_name": "Dilnoza Karimova", "department": "SEWING", "position": "Tikuvchi", "line_id": fx["line"]["id"], "shift_id": fx["day"]["id"], "pay_type": "PIECE", "pay_rate": 1500, "daily_norm": 120}
    e1 = post("/employees", body).json()
    e2 = post("/employees", {**body, "full_name": "Malika Tursunova"}).json()
    assert (e1["employee_code"], e2["employee_code"]) == ("EMP-00001", "EMP-00002")
    assert e1["line"]["code"] == "TK-1" and e1["shift"]["name"] == "Kunduzgi" and e1["pay_rate"] == 1500
    assert post("/employees", {**body, "employee_code": "emp-00001"}).status_code == 409

    lines = client.get(f"{API}/production-lines", headers=o).json()
    assert lines[0]["employees_count"] == 2
    assert client.get(f"{API}/shifts", headers=o).json()[0]["employees_count"] == 2

    # Boshqa zavod liniyasi/smenasiga bog'lab bo'lmaydi
    other, _ = register_owner(client, "o2@r.uz", "Boshqa")
    foreign_line = client.post(f"{API}/production-lines", headers=other, json={"code": "X", "name": "Begona", "stage": "CUTTING"}).json()
    assert post("/employees", {**body, "line_id": foreign_line["id"]}).status_code == 422

    # Ishlab chiqarish boshlig'i xodimni boshqaradi, lekin maoshni ko'rmaydi va o'zgartirmaydi
    planner = add_user(client, o, "p@r.uz", "PRODUCTION_MANAGER")
    seen = client.get(f"{API}/employees/{e1['id']}", headers=planner).json()
    assert seen["pay_rate"] is None and seen["daily_norm"] == 120
    assert client.patch(f"{API}/employees/{e1['id']}", headers=planner, json={"daily_norm": 130}).status_code == 200
    assert client.patch(f"{API}/employees/{e1['id']}", headers=planner, json={"pay_rate": 9999}).status_code == 403

    # Maosh o'zgarishi auditda ochiq ko'rinmaydi
    client.patch(f"{API}/employees/{e1['id']}", headers=o, json={"pay_rate": 1700})
    log = client.get(f"{API}/audit-logs", headers=o, params={"entity": "employee"}).json()["items"][0]
    assert log["changes"]["pay_rate"] == ["***", "***"]

    # Tizim akkauntiga bog'lash: bir akkaunt — bitta xodim
    keeper_headers = add_user(client, o, "k@r.uz", "WAREHOUSE_MANAGER")
    keeper_id = client.get(f"{API}/auth/me", headers=keeper_headers).json()["id"]
    assert client.patch(f"{API}/employees/{e1['id']}", headers=o, json={"user_id": keeper_id}).json()["user_email"] == "k@r.uz"
    assert client.patch(f"{API}/employees/{e2['id']}", headers=o, json={"user_id": keeper_id}).status_code == 409

    # Filtrlar va sahifalash
    client.patch(f"{API}/employees/{e2['id']}", headers=o, json={"status": "ON_LEAVE"})
    assert client.get(f"{API}/employees", headers=o, params={"status": "ACTIVE"}).json()["total"] == 1
    page = client.get(f"{API}/employees", headers=o, params={"search": "malika", "limit": 1}).json()
    assert page["total"] == 1 and page["items"][0]["full_name"] == "Malika Tursunova"


def _backdate(machine_id: int, hours: float) -> None:
    """Joriy (ochiq) holat davrini o'tmishga suradi — downtime hisobini sinash uchun."""
    with SessionLocal() as db:
        log = db.scalar(select(MachineStatusLog).where(MachineStatusLog.machine_id == machine_id, MachineStatusLog.ended_at.is_(None)))
        log.started_at = datetime.now(timezone.utc) - timedelta(hours=hours)
        db.commit()


def test_machine_status_history_and_downtime(client, fx):
    o, post = fx["owner"], fx["post"]
    m = post("/machines", {"code": "jk-01", "name": "Juki DDL-8700", "machine_type": "LOCKSTITCH", "brand": "Juki", "line_id": fx["line"]["id"]}).json()
    assert m["code"] == "JK-01" and m["status"] == "IDLE" and len(m["history"]) == 1
    url = f"{API}/machines/{m['id']}"

    client.post(f"{url}/status", headers=o, json={"status": "WORKING"})
    assert client.post(f"{url}/status", headers=o, json={"status": "WORKING"}).status_code == 409
    # Buzilish sababsiz qayd etilmaydi
    assert client.post(f"{url}/status", headers=o, json={"status": "BROKEN"}).status_code == 422
    d = client.post(f"{url}/status", headers=o, json={"status": "BROKEN", "reason": "Igna ushlagich sindi"}).json()
    assert d["status"] == "BROKEN" and d["history"][0]["reason"] == "Igna ushlagich sindi"
    assert d["history"][1]["ended_at"] is not None  # oldingi davr yopildi
    assert client.get(f"{API}/production-lines", headers=o).json()[0]["machines_down"] == 1

    _backdate(m["id"], 3)  # 3 soat buzuq turdi
    d = client.post(f"{url}/maintenance", headers=o, json={"kind": "REPAIR", "description": "Igna ushlagich almashtirildi", "cost": 250000, "duration_minutes": 90, "technician_name": "Usta Rustam", "set_status": "WORKING"}).json()
    assert d["status"] == "WORKING"
    assert d["stats"]["broken_minutes"] == pytest.approx(180, abs=1)
    assert d["stats"]["breakdowns"] == 1 and d["stats"]["repair_cost"] == 250000
    assert d["stats"]["availability_pct"] == pytest.approx(round(100 * (43200 - 180) / 43200, 1), abs=0.1)
    assert d["maintenance"][0]["kind"] == "REPAIR" and d["maintenance"][0]["technician_name"] == "Usta Rustam"

    s = client.get(f"{API}/resources/summary", headers=o).json()
    assert s["machines_total"] == 1 and s["machines_by_status"]["WORKING"] == 1
    assert s["downtime_hours_30d"] == pytest.approx(3, abs=0.05)

    # Tarixi bor mashina o'chmaydi
    assert client.delete(url, headers=o).status_code == 409
    assert client.patch(url, headers=o, json={"is_active": False}).json()["is_active"] is False


def test_maintenance_schedule(client, fx):
    o, post = fx["owner"], fx["post"]
    long_ago = (date.today() - timedelta(days=100)).isoformat()
    soon = (date.today() - timedelta(days=85)).isoformat()
    overdue = post("/machines", {"code": "OV-1", "name": "Overlok", "machine_type": "OVERLOCK", "purchase_date": long_ago, "maintenance_interval_days": 90}).json()
    due = post("/machines", {"code": "OV-2", "name": "Overlok 2", "machine_type": "OVERLOCK", "last_maintenance_date": soon, "maintenance_interval_days": 90}).json()
    post("/machines", {"code": "PR-1", "name": "Press", "machine_type": "PRESS"})
    assert overdue["maintenance_overdue"] is True and due["maintenance_due_soon"] is True
    assert client.get(f"{API}/machines", headers=o, params={"maintenance": "overdue"}).json()["total"] == 1
    assert client.get(f"{API}/machines", headers=o, params={"maintenance": "due_soon"}).json()["items"][0]["code"] == "OV-2"

    # Rejali xizmat keyingi sanani suradi
    d = client.post(f"{API}/machines/{overdue['id']}/maintenance", headers=o, json={"kind": "PREVENTIVE", "description": "Moylash, tozalash"}).json()
    assert d["last_maintenance_date"] == date.today().isoformat()
    assert d["next_maintenance_date"] == (date.today() + timedelta(days=90)).isoformat()
    assert d["maintenance_overdue"] is False
    s = client.get(f"{API}/resources/summary", headers=o).json()
    assert s["maintenance_overdue"] == 0 and s["maintenance_due_soon"] == 1

    # Tarixsiz mashina o'chiriladi
    fresh = post("/machines", {"code": "TMP", "name": "Vaqtincha", "machine_type": "OTHER"}).json()
    assert client.delete(f"{API}/machines/{fresh['id']}", headers=o).status_code == 204


def test_roles_and_isolation(client, fx):
    o = fx["owner"]
    m = fx["post"]("/machines", {"code": "M1", "name": "Mashina", "machine_type": "OTHER"}).json()
    worker = add_user(client, o, "w@r.uz", "WORKER")
    quality = add_user(client, o, "q@r.uz", "QUALITY_MANAGER")
    keeper = add_user(client, o, "k2@r.uz", "WAREHOUSE_MANAGER")
    assert client.get(f"{API}/employees", headers=worker).status_code == 403
    assert client.get(f"{API}/machines", headers=keeper).status_code == 403
    assert client.get(f"{API}/machines", headers=quality).status_code == 200
    assert client.post(f"{API}/machines/{m['id']}/status", headers=quality, json={"status": "WORKING"}).status_code == 403

    other, _ = register_owner(client, "o3@r.uz", "Uchinchi")
    assert client.get(f"{API}/machines/{m['id']}", headers=other).status_code == 404
    assert client.get(f"{API}/machines", headers=other).json()["total"] == 0
    admin = auth(client, ADMIN_EMAIL)
    assert client.post(f"{API}/machines", headers=admin, json={"code": "Z", "name": "Admin", "machine_type": "OTHER"}).status_code == 422
    assert client.get(f"{API}/machines", headers=admin, params={"factory_id": fx["factory_id"]}).json()["total"] == 1


def test_machine_line_change_is_reflected(client, fx):
    other_line = fx["post"]("/production-lines", {"code": "KS-1", "name": "Kesish", "stage": "CUTTING"}).json()
    m = fx["post"]("/machines", {"code": "C1", "name": "Bichish", "machine_type": "CUTTING", "line_id": fx["line"]["id"]}).json()
    r = client.patch(f"{API}/machines/{m['id']}", headers=fx["owner"], json={"line_id": other_line["id"]}).json()
    assert r["line"]["code"] == "KS-1"
