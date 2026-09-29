from datetime import date

from app.core.database import SessionLocal
from app.models import Attendance
from app.models.attendance import AttendanceStatus
from tests.conftest import API, add_user, register_owner
from tests.test_analytics import f

MONTH = date.today().strftime("%Y-%m")


def produce(client, f, qty=10):
    o, post = f["owner"], f["post"]
    wo = client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={}).json()[0]
    post(f"/production/work-orders/{wo['id']}/logs", {"stage": "CUTTING", "quantity_good": qty})
    post(f"/production/work-orders/{wo['id']}/logs", {"stage": "SEWING", "quantity_good": qty, "employee_id": f["piece"]["id"]})
    with SessionLocal() as db:
        today = date.today()
        db.add(Attendance(factory_id=f["factory_id"], employee_id=f["hourly"]["id"], work_date=today,
                          status=AttendanceStatus.PRESENT, worked_minutes=150))
        db.add(Attendance(factory_id=f["factory_id"], employee_id=f["monthly"]["id"], work_date=today, status=AttendanceStatus.ABSENT))
        db.commit()


def rows(client, headers, **params):
    r = client.get(f"{API}/payroll", headers=headers, params={"month": MONTH, **params})
    assert r.status_code == 200, r.text
    return {row["full_name"]: row for row in r.json()["rows"]}, r.json()["totals"]


def test_payroll_calculation(client, f):
    produce(client, f)
    data, totals = rows(client, f["owner"])
    assert data["Ishbay Tikuvchi"]["pieces"] == 10 and data["Ishbay Tikuvchi"]["base"] == 30000
    assert data["Soatbay Bichuvchi"]["hours"] == 2.5 and data["Soatbay Bichuvchi"]["base"] == 30000
    assert data["Oylik Nazoratchi"]["base"] == 4160000 and data["Oylik Nazoratchi"]["absent_days"] == 1
    assert totals["employees"] == 3 and totals["to_pay"] == 4220000 and totals["unpaid"] == 4220000


def test_adjustments_payment_and_locking(client, f):
    produce(client, f)
    o, emp = f["owner"], f["piece"]["id"]
    add = lambda kind, amount: client.post(f"{API}/payroll/adjustments", headers=o,  # noqa: E731
                                           json={"employee_id": emp, "month": MONTH, "kind": kind, "amount": amount, "note": "test"})
    assert add("BONUS", 5000).status_code == 201
    assert add("DEDUCTION", 2000).status_code == 201
    advance = add("ADVANCE", 10000).json()
    row = rows(client, o)[0]["Ishbay Tikuvchi"]
    assert (row["bonus"], row["deduction"], row["advance"], row["accrued"], row["to_pay"]) == (5000, 2000, 10000, 33000, 23000)
    listed = client.get(f"{API}/payroll/adjustments", headers=o, params={"month": MONTH, "employee_id": emp}).json()
    assert [a["kind"] for a in listed] == ["BONUS", "DEDUCTION", "ADVANCE"]

    paid = client.post(f"{API}/payroll/payments", headers=o, json={"employee_id": emp, "month": MONTH})
    assert paid.status_code == 201 and paid.json()["paid_amount"] == 23000
    assert client.post(f"{API}/payroll/payments", headers=o, json={"employee_id": emp, "month": MONTH}).status_code == 409
    assert add("BONUS", 1).status_code == 409
    assert client.delete(f"{API}/payroll/adjustments/{advance['id']}", headers=o).status_code == 409
    totals = rows(client, o)[1]
    assert totals["paid"] == 23000 and totals["unpaid"] == 30000 + 4160000

    assert client.delete(f"{API}/payroll/payments/{paid.json()['payment_id']}", headers=o).status_code == 204
    assert client.delete(f"{API}/payroll/adjustments/{advance['id']}", headers=o).status_code == 204
    assert rows(client, o)[0]["Ishbay Tikuvchi"]["to_pay"] == 33000


def test_negative_pay_blocked_and_access(client, f):
    o = f["owner"]
    client.post(f"{API}/payroll/adjustments", headers=o,
                json={"employee_id": f["piece"]["id"], "month": MONTH, "kind": "ADVANCE", "amount": 50000})
    assert client.post(f"{API}/payroll/payments", headers=o, json={"employee_id": f["piece"]["id"], "month": MONTH}).status_code == 409
    pm = add_user(client, o, "pm@pay.uz", "PRODUCTION_MANAGER")
    assert client.get(f"{API}/payroll", headers=pm, params={"month": MONTH}).status_code == 403
    other, _ = register_owner(client, "other@pay.uz", "Boshqa")
    assert client.get(f"{API}/payroll", headers=other, params={"month": MONTH}).json()["rows"] == []
    assert client.post(f"{API}/payroll/payments", headers=other, json={"employee_id": f["piece"]["id"], "month": MONTH}).status_code == 404
    assert client.get(f"{API}/payroll", headers=o, params={"month": "2026-13"}).status_code == 422
