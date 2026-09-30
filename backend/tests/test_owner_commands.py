"""Zavod chatidagi /report va /absent, /me dagi bugungi davomat va hisob varaqalarini ommaviy yuborish."""

from app.services import employee_bot_service
from tests.conftest import API
from tests.test_analytics import f
from tests.test_employee_leave_bot import EMP_CHAT, FACTORY_CHAT, linked
from tests.test_telegram_bot import bot, hook, message


def test_report_only_in_factory_chat(client, bot, linked):
    hook(client, message("/report", chat_id=int(FACTORY_CHAT)))
    last = bot["sent"][-1]
    assert last["chat_id"] == FACTORY_CHAT and "Kunlik hisobot" in last["text"]
    hook(client, message("/report", chat_id=999))
    assert bot["sent"][-1]["chat_id"] == 999 and "faqat zavod chatida" in bot["sent"][-1]["text"]
    count = len(bot["sent"])
    hook(client, message("/report", chat_id=-100500, chat_type="group"))  # begona guruh — jim
    assert len(bot["sent"]) == count


def test_absent_lists_missing_and_late(client, bot, linked):
    o = linked["owner"]
    client.post(f"{API}/attendance/check-in", headers=o, json={"employee_id": linked["hourly"]["id"]})
    hook(client, message("/absent", chat_id=int(FACTORY_CHAT)))
    text = bot["sent"][-1]["text"]
    assert "Bugungi davomat" in text and "Keldi: 1/3" in text
    assert "Ishbay Tikuvchi — belgilanmagan" in text and "Oylik Nazoratchi — belgilanmagan" in text
    assert "Soatbay Bichuvchi — belgilanmagan" not in text


def test_me_shows_today_attendance(client, bot, linked):
    hook(client, message("/me", chat_id=EMP_CHAT))
    assert "keldi" not in bot["sent"][-1]["text"]
    client.post(f"{API}/attendance/check-in", headers=linked["owner"], json={"employee_id": linked["emp_id"], "at": "08:05"})
    hook(client, message("/me", chat_id=EMP_CHAT))
    assert "Bugun: keldi 08:05 · ketdi —" in bot["sent"][-1]["text"]


def test_bulk_payslips(client, bot, linked):
    month = employee_bot_service.previous_month()
    r = client.post(f"{API}/payroll/payslips/send", headers=linked["owner"], json={"month": month})
    assert r.status_code == 200 and r.json() == {"sent": 1, "not_linked": 2}
    slip = bot["sent"][-1]
    assert slip["chat_id"] == str(EMP_CHAT) and "Hisob varaqasi" in slip["text"]
    assert client.post(f"{API}/payroll/payslips/send", headers=linked["owner"], json={"month": "2026-13"}).status_code == 422


def test_bulk_payslips_requires_telegram(client, f):
    r = client.post(f"{API}/payroll/payslips/send", headers=f["owner"], json={"month": "2026-08"})
    assert r.status_code == 503
