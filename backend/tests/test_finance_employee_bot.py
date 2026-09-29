from datetime import date

from app.core.database import SessionLocal
from app.models import Employee
from app.services import daily_service, telegram_service
from tests.conftest import API, add_user, register_owner
from tests.test_analytics import f
from tests.test_telegram_bot import bot, hook, message

MONTH = date.today().strftime("%Y-%m")


def test_profit_loss(client, f):
    o, post = f["owner"], f["post"]
    order = f["order"]
    assert client.post(f"{API}/orders/{order['id']}/materials/issue", headers=o,
                       json={"lines": [{"material_id": f["fab"]["id"], "quantity": 10}]}).status_code == 200
    assert client.post(f"{API}/orders/{order['id']}/payment", headers=o).status_code == 200
    for category, amount in (("RENT", 3_000_000), ("UTILITIES", 500_000), ("RENT", 1_000_000)):
        r = post("/finance/expenses", {"expense_date": date.today().isoformat(), "category": category, "amount": amount, "note": "test"})
        assert r.status_code == 201, r.text
    pl = client.get(f"{API}/finance/profit-loss", headers=o, params={"month": MONTH}).json()
    assert pl["revenue"] == 1_000_000 and pl["orders"] == 1
    assert pl["materials"] == 200_000
    assert pl["payroll"] == 4_160_000
    assert pl["expenses"] == 4_500_000 and pl["expenses_by_category"][0] == {"category": "RENT", "amount": 4_000_000}
    assert pl["total_costs"] == 200_000 + 4_160_000 + 4_500_000
    assert pl["profit"] == 1_000_000 - pl["total_costs"]
    assert len(pl["items"]) == 3 and pl["items"][0]["created_by_name"]

    expense_id = pl["items"][0]["id"]
    other, _ = register_owner(client, "other@fin.uz", "Boshqa")
    assert client.delete(f"{API}/finance/expenses/{expense_id}", headers=other).status_code == 404
    assert client.get(f"{API}/finance/profit-loss", headers=other, params={"month": MONTH}).json()["expenses"] == 0
    pm = add_user(client, o, "pm@fin.uz", "PRODUCTION_MANAGER")
    assert client.get(f"{API}/finance/profit-loss", headers=pm, params={"month": MONTH}).status_code == 403
    assert client.delete(f"{API}/finance/expenses/{expense_id}", headers=o).status_code == 204
    assert client.post(f"{API}/finance/expenses", headers=o, json={"expense_date": date.today().isoformat(), "category": "RENT", "amount": 0}).status_code == 422


def test_employee_links_and_sees_summary(client, bot, f):
    o = f["owner"]
    emp_id = f["piece"]["id"]
    st = client.get(f"{API}/telegram/employees/{emp_id}", headers=o).json()
    assert st["enabled"] and not st["linked"] and st["link_url"].startswith("https://t.me/tc_test_bot?start=e")
    code = st["link_url"].split("start=")[1]

    hook(client, message(f"/start e{emp_id}-0000000000", chat_id=321))
    assert "noto'g'ri" in bot["sent"][-1]["text"]
    hook(client, message(f"/start {code}", chat_id=321))
    with SessionLocal() as db:
        assert db.get(Employee, emp_id).telegram_chat_id == "321"
    summary = bot["sent"][-1]
    assert "Ishbay Tikuvchi" in summary["text"] and "Bugun: 0 dona" in summary["text"]
    assert summary["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == "me"

    hook(client, message("/me", chat_id=321))
    assert "Ishbay Tikuvchi" in bot["sent"][-1]["text"]
    hook(client, message("/me", chat_id=999))
    assert "ulanmagansiz" in bot["sent"][-1]["text"]

    other, _ = register_owner(client, "other@emp.uz", "Boshqa")
    assert client.get(f"{API}/telegram/employees/{emp_id}", headers=other).status_code == 404
    assert client.delete(f"{API}/telegram/employees/{emp_id}", headers=o).json()["linked"] is False


def test_daily_employee_report_only_for_active_today(client, bot, f):
    o, post = f["owner"], f["post"]
    with SessionLocal() as db:
        db.get(Employee, f["piece"]["id"]).telegram_chat_id = "111"
        db.get(Employee, f["hourly"]["id"]).telegram_chat_id = "222"
        db.commit()
    wo = client.post(f"{API}/orders/{f['order']['id']}/work-orders", headers=o, json={}).json()[0]
    post(f"/production/work-orders/{wo['id']}/logs", {"stage": "CUTTING", "quantity_good": 5})
    post(f"/production/work-orders/{wo['id']}/logs", {"stage": "SEWING", "quantity_good": 5, "employee_id": f["piece"]["id"]})
    with SessionLocal() as db:
        assert daily_service.send_employee_reports(db) == 1
    sent = [m for m in bot["sent"] if m["chat_id"] == "111"][-1]
    assert "Kunlik hisobot" in sent["text"] and "Bugun: 5 dona" in sent["text"] and "15 000" in sent["text"]
    assert telegram_service.employee_link_code(1) != telegram_service.employee_link_code(2)
