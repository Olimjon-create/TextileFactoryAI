"""Parolni email orqali tiklash va Telegram bildirishnomalar (tashqi xizmatlar soxta)."""

import re
from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Factory, PasswordResetToken
from app.services import mail_service, telegram_service
from tests.conftest import ADMIN_EMAIL, API, PASSWORD, add_user, auth, register_owner


@pytest.fixture()
def mailbox(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test")
    sent = []
    monkeypatch.setattr(mail_service, "send", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


def _token(body: str) -> str:
    return re.search(r"reset-password\?token=([\w-]+)", body).group(1)


def test_password_reset_flow(client, mailbox):
    assert client.get(f"{API}/auth/config").json()["password_reset_enabled"] is True
    # Noma'lum email — xat yo'q, lekin javob bir xil (email borligi oshkor qilinmaydi)
    assert client.post(f"{API}/auth/forgot-password", json={"email": "nobody@x.uz"}).status_code == 204
    assert mailbox == []

    r = client.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL.upper()}, headers={"Accept-Language": "ru"})
    assert r.status_code == 204
    (to, subject, body), = mailbox
    assert to == ADMIN_EMAIL and subject == "TextileCore: восстановление пароля"
    token = _token(body)
    with SessionLocal() as db:
        row = db.query(PasswordResetToken).one()
        assert row.token_hash != token and len(row.token_hash) == 64  # tokenning o'zi saqlanmaydi

    assert client.post(f"{API}/auth/reset-password", json={"token": "x" * 40, "new_password": "NewPass123"}).status_code == 400
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "short"}).status_code == 422
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "NewPass123"}).status_code == 204
    # Bir martalik; eski parol ishlamaydi, yangisi ishlaydi
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "new_password": "Other1234"}).status_code == 400
    assert client.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": PASSWORD}).status_code == 401
    auth(client, ADMIN_EMAIL, "NewPass123")


def test_password_reset_expiry_and_new_request_invalidates_old(client, mailbox):
    client.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
    first = _token(mailbox[-1][2])
    client.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL})
    second = _token(mailbox[-1][2])
    assert client.post(f"{API}/auth/reset-password", json={"token": first, "new_password": "NewPass123"}).status_code == 400
    with SessionLocal() as db:
        for row in db.query(PasswordResetToken).filter(PasswordResetToken.used_at.is_(None)):
            row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    assert client.post(f"{API}/auth/reset-password", json={"token": second, "new_password": "NewPass123"}).status_code == 400


def test_password_reset_disabled_without_mail(client):
    assert client.get(f"{API}/auth/config").json()["password_reset_enabled"] is False
    assert client.post(f"{API}/auth/forgot-password", json={"email": ADMIN_EMAIL}).status_code == 503


@pytest.fixture()
def bot(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "123:abc")
    telegram_service._bot_username.cache_clear()
    state = {"updates": [], "sent": []}

    def fake_call(method, timeout=6, **params):
        if method == "getMe":
            return {"username": "tc_test_bot"}
        if method == "getUpdates":
            return state["updates"]
        if method == "sendMessage":
            state["sent"].append(params)
            return {}
        raise AssertionError(method)

    monkeypatch.setattr(telegram_service, "_call", fake_call)
    yield state
    telegram_service._bot_username.cache_clear()


def test_telegram_link_and_notifications(client, bot):
    owner, factory_id = register_owner(client, "owner@t.uz", "Tele Tekstil")
    st = client.get(f"{API}/telegram/status", headers=owner).json()
    assert st["enabled"] and not st["linked"] and st["link_url"].startswith("https://t.me/tc_test_bot?start=f")
    code = st["link_url"].split("start=")[1]
    # Start bosilmagan
    assert client.post(f"{API}/telegram/check", headers=owner).status_code == 404
    bot["updates"] = [{"message": {"text": "/start boshqa-kod", "chat": {"id": 1}}}, {"message": {"text": f"/start {code}", "chat": {"id": 777}}}]
    r = client.post(f"{API}/telegram/check", headers={**owner, "Accept-Language": "en"})
    assert r.status_code == 200 and r.json()["linked"] is True
    assert bot["sent"][-1]["chat_id"] == "777" and "connected" in bot["sent"][-1]["text"]  # ulagan foydalanuvchi tilida
    # Boshqa zavod egasi bu kod bilan ulanmaydi, ishchi esa umuman kira olmaydi
    other, _ = register_owner(client, "other@t.uz", "Boshqa")
    assert client.post(f"{API}/telegram/check", headers=other).status_code == 404
    worker = add_user(client, owner, "w@t.uz", "WORKER")
    assert client.get(f"{API}/telegram/status", headers=worker).status_code == 403

    # Hodisa: material minimumdan pastga tushdi → bitta xabar
    post = lambda url, body: client.post(f"{API}{url}", headers=owner, json=body)  # noqa: E731
    mat = post("/inventory/materials", {"code": "FAB", "name": "Pike", "material_type": "FABRIC", "unit": "METER", "min_stock": 10}).json()
    loc = post("/inventory/locations", {"code": "A-1", "name": "Mato"}).json()
    mv = lambda kind, q: post("/inventory/movements", {"movement_type": kind, "material_id": mat["id"], "location_id": loc["id"], "quantity": q})  # noqa: E731
    assert mv("RECEIPT", 15).status_code == 201
    before = len(bot["sent"])
    assert mv("ISSUE", 3).status_code == 201  # 12 — hali yetarli
    assert len(bot["sent"]) == before
    assert mv("ISSUE", 4).status_code == 201  # 8 < 10 — ogohlantirish
    assert len(bot["sent"]) == before + 1 and "running low" in bot["sent"][-1]["text"] and "FAB" in bot["sent"][-1]["text"]
    assert mv("ISSUE", 1).status_code == 201  # allaqachon past — takror xabar yo'q
    assert len(bot["sent"]) == before + 1

    # Sinov xabari va uzish
    assert client.post(f"{API}/telegram/test", headers=owner).status_code == 204
    assert client.delete(f"{API}/telegram", headers=owner).json()["linked"] is False
    sent = len(bot["sent"])
    mv("ISSUE", 8)  # tugadi, lekin chat uzilgan — xabar yo'q
    assert len(bot["sent"]) == sent
    with SessionLocal() as db:
        assert db.get(Factory, factory_id).telegram_chat_id is None


def test_telegram_disabled(client):
    owner, _ = register_owner(client, "owner@t.uz", "Tele")
    st = client.get(f"{API}/telegram/status", headers=owner).json()
    assert st == {"enabled": False, "bot_username": None, "linked": False, "link_url": None}
    assert client.post(f"{API}/telegram/check", headers=owner).status_code == 503
