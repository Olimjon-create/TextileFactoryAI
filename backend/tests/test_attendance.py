"""Davomat: kelish/ketish, kechikish, ishlagan vaqt, kelmagan kunlar, javob so'rovlari va oylik hisobot."""

from datetime import datetime, timedelta, timezone

import pytest

from app.services import attendance_service
from tests.conftest import API, add_user, register_owner

TZ = timezone(timedelta(hours=5))
TODAY = "2026-09-26"


@pytest.fixture()
def fx(client, monkeypatch):
    clock = {"now": datetime(2026, 9, 26, 8, 0, tzinfo=TZ)}
    monkeypatch.setattr(attendance_service, "local_now", lambda: clock["now"])
    owner, factory_id = register_owner(client, "owner@a.uz", "Davomat Tekstil")
    post = lambda url, body: client.post(f"{API}{url}", headers=owner, json=body)
    day = post("/shifts", {"name": "Kunduzgi", "start_time": "08:00", "end_time": "17:00", "break_minutes": 60}).json()
    night = post("/shifts", {"name": "Tungi", "start_time": "22:00", "end_time": "06:00", "break_minutes": 30}).json()
    emp = lambda name, shift: post("/employees", {"full_name": name, "phone": "+998901112233", "department": "SEWING", "shift_id": shift["id"]}).json()
    return {
        "owner": owner, "post": post, "clock": clock, "factory_id": factory_id,
        "a": emp("Aziza Karimova", day), "b": emp("Bobur Aliyev", day), "c": emp("Charos Tungi", night), "d": emp("Dilshod Kasal", day),
    }


def board(client, fx, **params):
    return client.get(f"{API}/attendance/daily", headers=fx["owner"], params=params).json()


def test_check_in_out_late_and_worked(client, fx):
    post, clock = fx["post"], fx["clock"]
    clock["now"] = datetime(2026, 9, 26, 8, 3, tzinfo=TZ)
    r = post("/attendance/check-in", {"employee_id": fx["a"]["id"]}).json()
    assert r["check_in"] == "08:03:00" and r["late_minutes"] == 0
    assert post("/attendance/check-in", {"employee_id": fx["a"]["id"]}).status_code == 409
    clock["now"] = datetime(2026, 9, 26, 8, 40, tzinfo=TZ)
    assert post("/attendance/check-in", {"employee_id": fx["b"]["id"]}).json()["late_minutes"] == 40

    b = board(client, fx)
    assert b["is_today"] and b["summary"]["present"] == 2 and b["summary"]["late"] == 1 and b["summary"]["at_work"] == 2
    assert b["summary"]["not_marked"] == 2
    rows = {r["employee"]["full_name"]: r for r in b["rows"]}
    assert rows["Aziza Karimova"]["employee"]["phone"] == "+998901112233"
    assert rows["Aziza Karimova"]["employee"]["shift_start"] == "08:00:00"
    assert rows["Bobur Aliyev"]["state"] == "LATE"

    clock["now"] = datetime(2026, 9, 26, 17, 5, tzinfo=TZ)
    out = post("/attendance/check-out", {"employee_id": fx["a"]["id"]}).json()
    assert out["check_out"] == "17:05:00" and out["worked_minutes"] == 482
    assert post("/attendance/check-out", {"employee_id": fx["a"]["id"]}).status_code == 409
    assert post("/attendance/check-out", {"employee_id": fx["d"]["id"]}).status_code == 409
    assert board(client, fx)["summary"]["at_work"] == 1

    assert [r["employee"]["full_name"] for r in board(client, fx, state="LATE")["rows"]] == ["Bobur Aliyev"]
    assert len(board(client, fx, state="PRESENT")["rows"]) == 2


def test_night_shift_checkout_next_day(client, fx):
    post, clock = fx["post"], fx["clock"]
    clock["now"] = datetime(2026, 9, 26, 22, 10, tzinfo=TZ)
    assert post("/attendance/check-in", {"employee_id": fx["c"]["id"]}).json()["late_minutes"] == 10
    clock["now"] = datetime(2026, 9, 26, 20, 30, tzinfo=TZ)
    assert post("/attendance/check-in", {"employee_id": fx["d"]["id"]}).json()["late_minutes"] == 12 * 60 + 30
    clock["now"] = datetime(2026, 9, 27, 6, 0, tzinfo=TZ)
    out = post("/attendance/check-out", {"employee_id": fx["c"]["id"]}).json()
    assert out["work_date"] == TODAY and out["worked_minutes"] == 440


def test_manual_absent_and_correction(client, fx):
    post = fx["post"]
    o = fx["owner"]
    put = lambda body: client.put(f"{API}/attendance", headers=o, json=body)
    r = put({"employee_id": fx["d"]["id"], "work_date": TODAY, "status": "ABSENT", "note": "Telefoni o'chiq"}).json()
    assert r["status"] == "ABSENT" and r["check_in"] is None
    assert board(client, fx)["summary"]["absent"] == 1
    assert put({"employee_id": fx["d"]["id"], "work_date": TODAY, "status": "PRESENT"}).status_code == 422
    fixed = put({"employee_id": fx["d"]["id"], "work_date": TODAY, "status": "PRESENT", "check_in": "09:15", "check_out": "18:00"}).json()
    assert fixed["late_minutes"] == 75 and fixed["worked_minutes"] == 8 * 60 + 45 - 60
    logs = client.get(f"{API}/audit-logs", headers=o, params={"entity": "attendance"}).json()["items"]
    assert len(logs) == 2
    assert client.delete(f"{API}/attendance/{fixed['id']}", headers=o).status_code == 204
    assert board(client, fx)["summary"]["not_marked"] == 4
    put({"employee_id": fx["d"]["id"], "work_date": TODAY, "status": "ABSENT"})
    assert post("/attendance/check-in", {"employee_id": fx["d"]["id"], "at": "10:00"}).json()["status"] == "PRESENT"


def test_leave_requests_flow(client, fx):
    post, o = fx["post"], fx["owner"]
    lr = post("/leave-requests", {"employee_id": fx["b"]["id"], "leave_type": "FAMILY", "start_date": "2026-09-28", "end_date": "2026-09-29", "reason": "Singlisining to'yi"}).json()
    assert lr["status"] == "PENDING" and lr["days"] == 2
    assert post("/leave-requests", {"employee_id": fx["b"]["id"], "start_date": "2026-09-29", "reason": "Takror"}).status_code == 409
    page = client.get(f"{API}/leave-requests", headers=o).json()
    assert page["pending"] == 1 and page["total"] == 1
    row = next(r for r in board(client, fx, day="2026-09-28")["rows"] if r["employee"]["id"] == fx["b"]["id"])
    assert row["leave"]["status"] == "PENDING" and row["state"] == "NOT_MARKED"

    ok = client.post(f"{API}/leave-requests/{lr['id']}/approve", headers=o, json={"note": "Tabriklaymiz"}).json()
    assert ok["status"] == "APPROVED" and ok["decided_by_name"]
    assert client.post(f"{API}/leave-requests/{lr['id']}/reject", headers=o, json={}).status_code == 409
    b = board(client, fx, day="2026-09-28")
    assert b["summary"]["on_leave"] == 1
    assert next(r for r in b["rows"] if r["employee"]["id"] == fx["b"]["id"])["state"] == "LEAVE"

    sick = post("/leave-requests", {"employee_id": fx["d"]["id"], "leave_type": "SICK", "start_date": "2026-09-28", "reason": "Gripp", "approve": True}).json()
    assert sick["status"] == "APPROVED"
    assert board(client, fx, day="2026-09-28")["summary"]["sick"] == 1

    hourly = post("/leave-requests", {"employee_id": fx["a"]["id"], "start_date": "2026-09-30", "start_time": "14:00", "end_time": "16:00", "reason": "Shifokor", "approve": True}).json()
    assert hourly["status"] == "APPROVED"
    assert board(client, fx, day="2026-09-30")["summary"]["on_leave"] == 0
    assert post("/leave-requests", {"employee_id": fx["a"]["id"], "start_date": "2026-09-30", "start_time": "16:00", "end_time": "14:00", "reason": "x x"}).status_code == 422

    rej = post("/leave-requests", {"employee_id": fx["a"]["id"], "start_date": "2026-10-05", "reason": "Dam olish"}).json()
    assert client.post(f"{API}/leave-requests/{rej['id']}/reject", headers=o, json={"note": "Buyurtma ko'p"}).json()["status"] == "REJECTED"

    rep = client.get(f"{API}/attendance/monthly", headers=o, params={"month": "2026-09"}).json()
    rows = {r["employee"]["full_name"]: r for r in rep["rows"]}
    assert rows["Bobur Aliyev"]["leave_days"] == 2 and rows["Dilshod Kasal"]["sick_days"] == 1
    detail = client.get(f"{API}/attendance/employees/{fx['b']['id']}", headers=o, params={"month": "2026-09"}).json()
    assert len(detail["days"]) == 2 and detail["totals"]["leave_days"] == 2 and len(detail["leaves"]) == 1

    assert client.delete(f"{API}/leave-requests/{lr['id']}", headers=o).status_code == 204
    assert board(client, fx, day="2026-09-28")["summary"]["on_leave"] == 0


def test_permissions_and_isolation(client, fx):
    o = fx["owner"]
    worker = add_user(client, o, "w@a.uz", "WORKER")
    assert client.get(f"{API}/attendance/daily", headers=worker).status_code == 403
    quality = add_user(client, o, "q@a.uz", "QUALITY_MANAGER")
    assert client.get(f"{API}/attendance/daily", headers=quality).status_code == 200
    assert client.post(f"{API}/attendance/check-in", headers=quality, json={"employee_id": fx["a"]["id"]}).status_code == 403

    other, _ = register_owner(client, "o2@a.uz", "Boshqa zavod")
    assert client.post(f"{API}/attendance/check-in", headers=other, json={"employee_id": fx["a"]["id"]}).status_code == 404
    assert client.get(f"{API}/attendance/daily", headers=other).json()["summary"]["total"] == 0
