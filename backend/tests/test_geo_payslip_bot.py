"""Xodim kabineti: joylashuv bo'yicha davomat (Keldim/Ketdim) va hisob varaqasi."""

import time

from app.core.database import SessionLocal
from app.models import Attendance
from app.services import employee_bot_service, geo_attendance_service
from tests.conftest import API
from tests.test_analytics import f
from tests.test_employee_leave_bot import EMP_CHAT, linked, press
from tests.test_telegram_bot import bot, hook, message

FACTORY = (41.311081, 69.240562)  # Toshkent


def location(lat, lng, chat_id=EMP_CHAT, age=0, **extra):
    return {"message": {"chat": {"id": chat_id, "type": "private"}, "from": {"id": chat_id, "language_code": "uz"},
                        "date": int(time.time()) - age, "location": {"latitude": lat, "longitude": lng}, **extra}}


def enable_geo(client, owner, radius=150):
    r = client.put(f"{API}/attendance/geo-settings", headers=owner,
                   json={"enabled": True, "lat": FACTORY[0], "lng": FACTORY[1], "radius_m": radius})
    assert r.status_code == 200, r.text
    return r.json()


def test_distance():
    assert abs(geo_attendance_service.distance_m(*FACTORY, FACTORY[0] + 0.001, FACTORY[1]) - 111) < 2


def test_geo_settings_validation_and_isolation(client, linked):
    owner = linked["owner"]
    assert client.get(f"{API}/attendance/geo-settings", headers=owner).json()["enabled"] is False
    assert client.put(f"{API}/attendance/geo-settings", headers=owner, json={"enabled": True}).status_code == 422
    assert client.put(f"{API}/attendance/geo-settings", headers=owner, json={"enabled": True, "lat": 1, "lng": 1, "radius_m": 5}).status_code == 422
    saved = enable_geo(client, owner)
    assert saved == {"enabled": True, "lat": FACTORY[0], "lng": FACTORY[1], "radius_m": 150}


def test_disabled_geo_refuses(client, bot, linked):
    press(client, "geo", EMP_CHAT)
    assert "yoqilmagan" in bot["sent"][-1]["text"]
    hook(client, location(*FACTORY))
    assert "yoqilmagan" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 0


def test_check_in_and_out_by_location(client, bot, linked):
    enable_geo(client, linked["owner"])
    press(client, "geo", EMP_CHAT)
    assert bot["sent"][-1]["reply_markup"]["keyboard"][0][0]["request_location"] is True

    hook(client, location(FACTORY[0] + 0.01, FACTORY[1]))  # ~1.1 km
    assert "uzoqdasiz" in bot["sent"][-1]["text"]
    hook(client, location(*FACTORY, forward_origin={"type": "user"}))
    assert "faqat" in bot["sent"][-1]["text"]
    hook(client, location(*FACTORY, age=600))
    assert "eskirgan" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 0

    hook(client, location(FACTORY[0] + 0.0005, FACTORY[1]))  # ~55 m
    assert "Keldingiz" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        rec = db.query(Attendance).one()
        assert rec.employee_id == linked["emp_id"] and rec.check_in is not None and rec.check_out is None
        assert "Telegram" in rec.note
    hook(client, location(*FACTORY))
    assert "Ketdingiz" in bot["sent"][-1]["text"]
    hook(client, location(*FACTORY))
    assert "allaqachon" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        assert db.query(Attendance).one().check_out is not None


def test_stranger_location_ignored(client, bot, linked):
    enable_geo(client, linked["owner"])
    hook(client, location(*FACTORY, chat_id=999))
    with SessionLocal() as db:
        assert db.query(Attendance).count() == 0


def test_payslip_on_payment_and_on_request(client, bot, linked):
    month = employee_bot_service.previous_month()
    r = client.post(f"{API}/payroll/payments", headers=linked["owner"], json={"employee_id": linked["emp_id"], "month": month})
    assert r.status_code == 201, r.text
    slip = bot["sent"][-1]
    assert slip["chat_id"] == str(EMP_CHAT) and "Hisob varaqasi" in slip["text"] and "Ishbay Tikuvchi" in slip["text"]
    assert "to'langan" in slip["text"]

    press(client, "ps", EMP_CHAT)
    assert "Hisob varaqasi" in bot["sent"][-1]["text"]
    hook(client, message("/payslip", chat_id=999))
    assert "ulanmagansiz" in bot["sent"][-1]["text"]


def test_me_keyboard_rows(client, bot, linked):
    hook(client, message("/me", chat_id=EMP_CHAT))
    data = [b["callback_data"] for row in bot["sent"][-1]["reply_markup"]["inline_keyboard"] for b in row]
    assert data == ["me", "lv", "geo", "ps"]
