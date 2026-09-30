"""Kunlik vazifa (Vercel Cron): tozalash, zavodlarga hisobot; server xatosi haqida administratorga xabar."""

import time
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select, update

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Factory, Order, OrderItem, RateLimitHit
from app.services import daily_service, store_service, telegram_service
from tests.conftest import API
from tests.test_store import checkout, pay, shop

SECRET = "cron-test-secret"


@pytest.fixture()
def bot(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "123:abc")
    monkeypatch.setattr(settings, "CRON_SECRET", SECRET)
    sent = []

    def fake_call(method, timeout=6, **params):
        if method == "sendMessage":
            sent.append(params)
        return {"username": "tc_test_bot"}

    monkeypatch.setattr(telegram_service, "_call", fake_call)
    telegram_service._last_alert.clear()
    return sent


def cron(client, secret=SECRET):
    return client.get(f"{API}/cron/daily", headers={"Authorization": f"Bearer {secret}"} if secret else {})


def test_cron_requires_secret(client, bot, monkeypatch):
    assert cron(client, secret=None).status_code == 403
    assert cron(client, secret="wrong").status_code == 403
    monkeypatch.setattr(settings, "CRON_SECRET", "")
    assert cron(client, secret="").status_code == 403


def test_daily_report_and_cleanup(client, bot, shop):
    owner = shop["owner"]
    client.post(f"{API}/inventory/materials", headers=owner,
                json={"code": "FAB", "name": "Pike", "material_type": "FABRIC", "unit": "METER", "min_stock": 10})
    pay(client, checkout(client, shop).json()["order"]["public_token"])
    checkout(client, shop)
    with SessionLocal() as db:
        f = db.get(Factory, shop["factory_id"])
        f.telegram_chat_id, f.telegram_lang = "42", "en"
        db.add(RateLimitHit(key="old", window_start=int(time.time()) - 3 * 86400, hits=1))
        db.add(RateLimitHit(key="fresh", window_start=int(time.time()), hits=1))
        db.commit()

    r = cron(client)
    assert r.status_code == 200
    body = r.json()
    assert body["reports_sent"] == 1 and body["cleanup"]["rate_limit_hits"] == 1
    report = bot[-1]
    assert report["chat_id"] == "42" and "Daily report" in report["text"] and "Alpha Textile" in report["text"]
    assert "Today's orders: 1 · 297 502 UZS" in report["text"]
    assert "Open orders: 1 (overdue: 0)" in report["text"]
    assert "Materials below minimum: 1" in report["text"]
    with SessionLocal() as db:
        assert [h.key for h in db.query(RateLimitHit)] == ["fresh"]


def test_report_day_uses_tashkent_time(client, shop):
    pay(client, checkout(client, shop).json()["order"]["public_token"])
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        f = db.get(Factory, shop["factory_id"])
        assert daily_service.factory_report(db, f, now)["orders"] == 1
        assert daily_service.factory_report(db, f, now + timedelta(days=1))["orders"] == 0


def test_server_error_alerts_admin_once(client, bot, monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_ADMIN_CHAT_ID", "900")

    def boom(*args, **kwargs):
        raise RuntimeError("baza javob bermadi")

    monkeypatch.setattr(store_service, "list_factories", boom)
    for _ in range(2):
        with pytest.raises(RuntimeError):
            client.get(f"{API}/store/factories")
    alerts = [m for m in bot if m["chat_id"] == "900"]
    assert len(alerts) == 1
    assert "GET /api/v1/store/factories" in alerts[0]["text"] and "baza javob bermadi" in alerts[0]["text"]


def test_cleanup_removes_old_unpaid_orders(client, shop):
    old = checkout(client, shop).json()["order"]["public_token"]
    fresh = checkout(client, shop).json()["order"]["public_token"]
    paid_old = checkout(client, shop).json()["order"]["public_token"]
    pay(client, paid_old)
    with SessionLocal() as db:
        long_ago = datetime.now(timezone.utc) - timedelta(days=daily_service.UNPAID_ORDER_TTL_DAYS + 1)
        db.execute(update(Order).where(Order.public_token.in_([old, paid_old])).values(created_at=long_ago))
        db.commit()
        assert daily_service.cleanup(db)["unpaid_orders"] == 1
        left = set(db.scalars(select(Order.public_token)))
        assert left == {fresh, paid_old}
        assert db.scalar(select(func.count(OrderItem.id)).where(OrderItem.order_id.not_in(select(Order.id)))) == 0
