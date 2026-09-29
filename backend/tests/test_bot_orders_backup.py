import gzip
import sqlite3

import pytest

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.models import Factory, Order
from app.services import backup_service
from tests.conftest import API
from tests.test_store import checkout, pay, shop
from tests.test_telegram_bot import bot, hook


def link_factory(factory_id, chat_id="500"):
    with SessionLocal() as db:
        db.get(Factory, factory_id).telegram_chat_id = chat_id
        db.commit()


def press(client, data, chat_id=500):
    return hook(client, {"callback_query": {"id": "cb", "data": data, "from": {"id": 1},
                                            "message": {"message_id": 9, "chat": {"id": chat_id}}}})


def calls(bot, method):
    return [p for m, p in bot["calls"] if m == method]


def new_paid_order(client, shop):
    token = checkout(client, shop).json()["order"]["public_token"]
    pay(client, token)
    with SessionLocal() as db:
        return db.query(Order).filter_by(public_token=token).one().id


def test_new_order_message_has_buttons(client, bot, shop):
    link_factory(shop["factory_id"])
    order_id = new_paid_order(client, shop)
    sent = bot["sent"][-1]
    buttons = [b for row in sent["reply_markup"]["inline_keyboard"] for b in row]
    assert {b.get("callback_data") for b in buttons} >= {f"o:c:{order_id}", f"o:x:{order_id}"}
    assert any(b.get("url", "").endswith(f"/orders/{order_id}") for b in buttons)


def test_confirm_from_telegram(client, bot, shop):
    link_factory(shop["factory_id"])
    order_id = new_paid_order(client, shop)
    assert press(client, f"o:c:{order_id}").status_code == 200
    with SessionLocal() as db:
        assert db.get(Order, order_id).status.value == "CONFIRMED"
    assert calls(bot, "editMessageReplyMarkup")[-1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == "o:done"
    press(client, f"o:c:{order_id}")
    with SessionLocal() as db:
        assert db.get(Order, order_id).status.value == "CONFIRMED"


def test_cancel_needs_confirmation(client, bot, shop):
    link_factory(shop["factory_id"])
    order_id = new_paid_order(client, shop)
    press(client, f"o:x:{order_id}")
    with SessionLocal() as db:
        assert db.get(Order, order_id).status.value == "NEW"
    confirm = calls(bot, "editMessageReplyMarkup")[-1]["reply_markup"]["inline_keyboard"][0]
    assert [b["callback_data"] for b in confirm] == [f"o:xx:{order_id}", f"o:k:{order_id}"]
    press(client, f"o:k:{order_id}")
    assert calls(bot, "editMessageReplyMarkup")[-1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == f"o:c:{order_id}"
    press(client, f"o:xx:{order_id}")
    with SessionLocal() as db:
        assert db.get(Order, order_id).status.value == "CANCELLED"
    press(client, f"o:c:{order_id}")
    assert calls(bot, "answerCallbackQuery")[-1]["show_alert"] is True
    with SessionLocal() as db:
        assert db.get(Order, order_id).status.value == "CANCELLED"


def test_other_chat_cannot_act(client, bot, shop):
    link_factory(shop["factory_id"])
    order_id = new_paid_order(client, shop)
    press(client, f"o:c:{order_id}", chat_id=999)
    press(client, "o:c:999999")
    with SessionLocal() as db:
        assert db.get(Order, order_id).status.value == "NEW"
    assert all(a["show_alert"] for a in calls(bot, "answerCallbackQuery")[-2:])


def test_snapshot_is_restorable_sqlite(client, shop, tmp_path):
    path = tmp_path / "snap.db"
    rows = backup_service.snapshot(engine, path)
    assert rows > 0
    con = sqlite3.connect(path)
    assert con.execute("select count(*) from products").fetchone()[0] == 4
    assert con.execute("select count(*) from alembic_version").fetchone()[0] in (0, 1)
    con.close()


def test_cloud_backup_uploads_private_and_prunes(client, shop, monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "secret")
    log = []

    class R:
        def __init__(self, status=200, data=None, text=""):
            self.status_code, self._data, self.text = status, data, text

        def json(self):
            return self._data

        def raise_for_status(self):
            return None

    existing = [{"name": f"textilecore-202601{d:02d}-0000.db.gz"} for d in range(1, 17)]

    def get(url, **kw):
        log.append(("GET", url))
        return R(404, {}, "not found")

    def post(url, **kw):
        log.append(("POST", url))
        if url.endswith("/storage/v1/bucket"):
            assert kw["json"]["public"] is False
            return R(200, {})
        if "/object/list/" in url:
            return R(200, existing)
        assert gzip.decompress(kw["data"])[:15] == b"SQLite format 3"
        return R(200, {})

    def delete(url, **kw):
        log.append(("DELETE", kw["json"]["prefixes"]))
        return R(200, {})

    monkeypatch.setattr(backup_service.requests, "get", get)
    monkeypatch.setattr(backup_service.requests, "post", post)
    monkeypatch.setattr(backup_service.requests, "delete", delete)
    result = backup_service.cloud_backup(engine)
    assert result["file"].startswith("textilecore-") and result["pruned"] == 2
    assert ("DELETE", [e["name"] for e in existing[:2]]) in log


def test_cloud_backup_refuses_public_bucket(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_URL", "https://x.supabase.co")
    monkeypatch.setattr(settings, "SUPABASE_SECRET_KEY", "secret")

    class R:
        status_code = 200

        def json(self):
            return {"public": True}

    monkeypatch.setattr(backup_service.requests, "get", lambda url, **kw: R())
    with pytest.raises(RuntimeError):
        backup_service.cloud_backup(engine)
