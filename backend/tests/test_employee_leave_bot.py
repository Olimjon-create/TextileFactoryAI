"""Xodim botdan javob so'raydi: tur → kunlar → sabab (ForceReply); rahbar zavod chatida yoki saytda tasdiqlaydi."""

from datetime import timedelta

import pytest

from app.core.database import SessionLocal
from app.models import Attendance, Factory, LeaveRequest
from app.models.attendance import LeaveStatus
from app.services import telegram_service
from tests.conftest import API
from tests.test_analytics import f
from tests.test_telegram_bot import bot, hook, message

EMP_CHAT = 321
FACTORY_CHAT = "4242"


def press(client, data, chat_id):
    return hook(client, {"callback_query": {"id": "cb", "data": data, "from": {"id": int(chat_id)},
                                            "message": {"message_id": 7, "chat": {"id": int(chat_id)}}}})


def reply(client, prompt, text, chat_id=EMP_CHAT, from_bot=True):
    return hook(client, {"message": {
        "text": text, "chat": {"id": chat_id, "type": "private"}, "from": {"id": chat_id, "language_code": "uz"},
        "reply_to_message": {"text": prompt, "from": {"id": 1, "is_bot": from_bot}},
    }})


@pytest.fixture()
def linked(client, bot, f):
    emp_id = f["piece"]["id"]
    code = client.get(f"{API}/telegram/employees/{emp_id}", headers=f["owner"]).json()["link_url"].split("start=")[1]
    hook(client, message(f"/start {code}", chat_id=EMP_CHAT))
    with SessionLocal() as db:
        db.get(Factory, f["factory_id"]).telegram_chat_id = FACTORY_CHAT
        db.commit()
    return {**f, "emp_id": emp_id}


def ask_leave(client, bot, kind="SICK", offset=0, days=2, reason="Isitmam bor"):
    press(client, "lv", EMP_CHAT)
    kinds = [b["callback_data"] for row in bot["sent"][-1]["reply_markup"]["inline_keyboard"] for b in row]
    assert f"lt:{kind}" in kinds
    press(client, f"lt:{kind}", EMP_CHAT)
    periods = [row[0]["callback_data"] for row in bot["sent"][-1]["reply_markup"]["inline_keyboard"]]
    assert f"ld:{kind}:{offset}:{days}" in periods
    press(client, f"ld:{kind}:{offset}:{days}", EMP_CHAT)
    prompt = bot["sent"][-1]
    assert prompt["reply_markup"]["force_reply"] is True
    reply(client, prompt["text"], reason)
    return prompt["text"]


def test_me_keyboard_has_leave_button(client, bot, linked):
    hook(client, message("/me", chat_id=EMP_CHAT))
    rows = bot["sent"][-1]["reply_markup"]["inline_keyboard"]
    assert rows[0][0]["callback_data"] == "me" and rows[1][0]["callback_data"] == "lv"


def test_employee_requests_and_owner_approves_in_bot(client, bot, linked):
    ask_leave(client, bot)
    today = telegram_service.tashkent_today()
    with SessionLocal() as db:
        lr = db.query(LeaveRequest).one()
        assert lr.employee_id == linked["emp_id"] and lr.leave_type.value == "SICK" and lr.status == LeaveStatus.PENDING
        assert (lr.start_date, lr.end_date, lr.reason) == (today, today + timedelta(days=1), "Isitmam bor")
        leave_id = lr.id
    to_factory = next(m for m in reversed(bot["sent"]) if str(m["chat_id"]) == FACTORY_CHAT)
    assert "Isitmam bor" in to_factory["text"]
    assert [b["callback_data"] for b in to_factory["reply_markup"]["inline_keyboard"][0]] == [f"l:a:{leave_id}", f"l:r:{leave_id}"]
    assert "yuborildi" in next(m for m in reversed(bot["sent"]) if m["chat_id"] == EMP_CHAT)["text"]

    press(client, f"l:a:{leave_id}", "999")  # begona chat
    with SessionLocal() as db:
        assert db.get(LeaveRequest, leave_id).status == LeaveStatus.PENDING
    press(client, f"l:a:{leave_id}", FACTORY_CHAT)
    with SessionLocal() as db:
        assert db.get(LeaveRequest, leave_id).status == LeaveStatus.APPROVED
        assert db.query(Attendance).filter_by(leave_request_id=leave_id).count() == 2
    assert "tasdiqlandi" in bot["sent"][-1]["text"] and bot["sent"][-1]["chat_id"] == str(EMP_CHAT)


def test_reject_on_site_notifies_employee_with_note(client, bot, linked):
    ask_leave(client, bot, kind="PERSONAL", offset=1, days=1, reason="Hujjat topshirish")
    with SessionLocal() as db:
        leave_id = db.query(LeaveRequest).one().id
    r = client.post(f"{API}/leave-requests/{leave_id}/reject", headers=linked["owner"], json={"note": "Buyurtma muddati yaqin"})
    assert r.status_code == 200
    last = bot["sent"][-1]
    assert last["chat_id"] == str(EMP_CHAT) and "rad etildi" in last["text"] and "Buyurtma muddati yaqin" in last["text"]


def test_overlap_and_bad_inputs(client, bot, linked):
    prompt = ask_leave(client, bot)
    reply(client, prompt, "Yana kasalman")
    assert "boshqa javob so'rovi bor" in bot["sent"][-1]["text"]
    reply(client, prompt, "x")
    assert "kamida 2" in bot["sent"][-1]["text"]
    # Foydalanuvchi o'zi yozgan "belgi" (bot xabari emas) — e'tiborga olinmaydi
    reply(client, "#L SICK 2030-01-01 2030-01-05", "Sabab", from_bot=False)
    reply(client, "#L SICK 2000-01-01 2000-01-01", "Eski sana")
    assert "eskirgan" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        assert db.query(LeaveRequest).count() == 1


def test_not_linked_chat_cannot_request(client, bot, linked):
    press(client, "lv", 999)
    assert "ulanmagansiz" in bot["sent"][-1]["text"]
    reply(client, "✍️\n#L SICK 2099-01-01 2099-01-01", "Sabab", chat_id=999)
    with SessionLocal() as db:
        assert db.query(LeaveRequest).count() == 0
