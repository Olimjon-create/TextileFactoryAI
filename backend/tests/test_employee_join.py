"""Xodimlarni Telegram bot orqali qo'shish: havola → kontakt → rahbar tasdig'i (bot yoki sayt)."""

import pytest

from app.core.database import SessionLocal
from app.models import Employee, EmployeeJoinRequest, Factory, JoinRequestStatus
from app.services import telegram_service
from tests.conftest import API, register_owner
from tests.test_telegram_bot import bot, hook, message

FACTORY_CHAT = "4242"


def contact(chat_id, phone="998901112233", first="Dilnoza", last="Karimova", owner_id=None):
    return {"message": {
        "chat": {"id": chat_id, "type": "private"},
        "from": {"id": chat_id, "first_name": first, "language_code": "uz"},
        "contact": {"phone_number": phone, "first_name": first, "last_name": last,
                    "user_id": chat_id if owner_id is None else owner_id},
    }}


def press(client, data, chat_id=FACTORY_CHAT):
    return hook(client, {"callback_query": {"id": "cb", "data": data, "from": {"id": 1},
                                            "message": {"message_id": 7, "chat": {"id": int(chat_id)}}}})


@pytest.fixture()
def factory(client, bot):
    owner, factory_id = register_owner(client, "owner@join.uz", "Join Tekstil")
    with SessionLocal() as db:
        db.get(Factory, factory_id).telegram_chat_id = FACTORY_CHAT
        db.commit()
    link = client.get(f"{API}/employee-join/link", headers=owner).json()
    return {"owner": owner, "id": factory_id, "link": link, "code": link["link_url"].split("start=")[1]}


def request_via_bot(client, bot, factory, chat_id=700):
    hook(client, message(f"/start {factory['code']}", chat_id=chat_id))
    assert bot["sent"][-1]["reply_markup"]["keyboard"][0][0]["request_contact"] is True
    hook(client, contact(chat_id))
    with SessionLocal() as db:
        return db.query(EmployeeJoinRequest).filter_by(telegram_chat_id=str(chat_id)).one().id


def test_link_status(client, factory):
    link = factory["link"]
    assert link["enabled"] and link["factory_linked"] and link["pending"] == 0
    assert factory["code"].startswith(f"j{factory['id']}-")


def test_bad_link_rejected(client, bot, factory):
    hook(client, message(f"/start j{factory['id']}-0000000000", chat_id=700))
    assert "noto'g'ri" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        assert db.query(EmployeeJoinRequest).count() == 0


def test_join_and_approve_in_bot(client, bot, factory):
    rid = request_via_bot(client, bot, factory)
    to_factory = next(m for m in reversed(bot["sent"]) if str(m["chat_id"]) == FACTORY_CHAT)
    assert "Dilnoza Karimova" in to_factory["text"] and "+998901112233" in to_factory["text"]
    buttons = [b["callback_data"] for row in to_factory["reply_markup"]["inline_keyboard"] for b in row]
    assert f"j:a:{rid}:SEWING" in buttons and f"j:x:{rid}" in buttons
    assert client.get(f"{API}/employee-join/link", headers=factory["owner"]).json()["pending"] == 1

    # Begona chatdan bosish — rad etiladi
    press(client, f"j:a:{rid}:SEWING", chat_id="999")
    press(client, f"j:a:{rid}:SEWING")
    with SessionLocal() as db:
        emp = db.query(Employee).filter_by(factory_id=factory["id"]).one()
        assert emp.full_name == "Dilnoza Karimova" and emp.department.value == "SEWING"
        assert emp.telegram_chat_id == "700" and emp.phone == "+998901112233"
        req = db.get(EmployeeJoinRequest, rid)
        assert req.status == JoinRequestStatus.APPROVED and req.employee_id == emp.id
    assert any(str(m["chat_id"]) == "700" and "ulandingiz" in m["text"] for m in bot["sent"])

    # Qayta bosish — ikkinchi xodim yaratilmaydi; xodim havolani qayta ochsa — "allaqachon"
    press(client, f"j:a:{rid}:CUTTING")
    hook(client, message(f"/start {factory['code']}", chat_id=700))
    assert "allaqachon" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        assert db.query(Employee).filter_by(factory_id=factory["id"]).count() == 1


def test_approve_and_reject_on_site(client, bot, factory):
    owner = factory["owner"]
    first = request_via_bot(client, bot, factory, chat_id=701)
    second = request_via_bot(client, bot, factory, chat_id=702)
    pending = client.get(f"{API}/employee-join/requests", headers=owner).json()
    assert {r["id"] for r in pending} == {first, second}

    r = client.post(f"{API}/employee-join/requests/{first}/approve", headers=owner,
                    json={"department": "PACKING", "position": "Qadoqlovchi", "pay_type": "PIECE", "pay_rate": 500})
    assert r.status_code == 201
    emp = r.json()
    assert emp["department"] == "PACKING" and emp["position"] == "Qadoqlovchi" and emp["pay_type"] == "PIECE"
    assert client.post(f"{API}/employee-join/requests/{first}/approve", headers=owner, json={"department": "PACKING"}).status_code == 409

    assert client.post(f"{API}/employee-join/requests/{second}/reject", headers=owner).status_code == 204
    assert "rad etdi" in bot["sent"][-1]["text"] and str(bot["sent"][-1]["chat_id"]) == "702"
    assert client.get(f"{API}/employee-join/requests", headers=owner).json() == []


def test_other_factory_cannot_see_or_approve(client, bot, factory):
    rid = request_via_bot(client, bot, factory)
    other, _ = register_owner(client, "other@join.uz", "Boshqa")
    assert client.get(f"{API}/employee-join/requests", headers=other).json() == []
    assert client.post(f"{API}/employee-join/requests/{rid}/approve", headers=other, json={"department": "SEWING"}).status_code == 404


def test_foreign_contact_and_stray_contact(client, bot, factory):
    hook(client, message(f"/start {factory['code']}", chat_id=703))
    hook(client, contact(703, owner_id=12345))
    assert "o'zingizning" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        assert db.query(EmployeeJoinRequest).one().status == JoinRequestStatus.AWAITING_CONTACT
    # So'rovsiz yuborilgan kontakt — odatdagi javob, so'rov yaratilmaydi
    hook(client, contact(704))
    with SessionLocal() as db:
        assert db.query(EmployeeJoinRequest).filter_by(telegram_chat_id="704").count() == 0


def test_repeat_start_while_pending(client, bot, factory):
    request_via_bot(client, bot, factory, chat_id=705)
    hook(client, message(f"/start {factory['code']}", chat_id=705))
    assert "yuborilgan" in bot["sent"][-1]["text"]


def test_join_link_is_factory_specific(client, factory):
    assert telegram_service.join_link_code(factory["id"]) != telegram_service.join_link_code(factory["id"] + 1)
