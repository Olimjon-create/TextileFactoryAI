"""Telegram bot: webhook (do'kon, buyurtmalarim, zavodni ulash) va Mini App orqali buyurtma."""

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from app.core.config import settings
from app.core.database import SessionLocal
from app.models import Factory, Order
from app.services import telegram_service
from tests.conftest import ADMIN_EMAIL, API, auth, register_owner
from tests.test_store import checkout, pay, shop  # noqa: F401 — fixture

TOKEN = "123:abc"


@pytest.fixture()
def bot(monkeypatch):
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", TOKEN)
    monkeypatch.setattr(settings, "APP_URL", "https://shop.example.uz/")
    telegram_service._bot_username.cache_clear()
    state = {"sent": [], "calls": []}

    def fake_call(method, timeout=6, **params):
        state["calls"].append((method, params))
        if method == "getMe":
            return {"username": "tc_test_bot"}
        if method == "sendMessage":
            state["sent"].append(params)
        if method == "getUpdates":
            raise RuntimeError("Telegram getUpdates: Conflict: can't use getUpdates method while webhook is active")
        return {}

    monkeypatch.setattr(telegram_service, "_call", fake_call)
    yield state
    telegram_service._bot_username.cache_clear()


def hook(client, update, secret=None):
    return client.post(f"{API}/telegram/webhook", json=update,
                       headers={"X-Telegram-Bot-Api-Secret-Token": secret or telegram_service.webhook_secret()})


def message(text, chat_id=555, lang="uz", chat_type="private"):
    return {"message": {"text": text, "chat": {"id": chat_id, "type": chat_type},
                        "from": {"id": chat_id, "first_name": "Aziz", "language_code": lang}}}


def init_data(user_id=555, lang="ru", age=0, token=TOKEN):
    fields = {"auth_date": str(int(time.time()) - age), "query_id": "q1",
              "user": json.dumps({"id": user_id, "first_name": "Aziz", "language_code": lang})}
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_webhook_rejects_wrong_secret(client, bot):
    assert hook(client, message("/start"), secret="wrong").status_code == 403
    assert client.post(f"{API}/telegram/webhook", json={}).status_code == 403
    assert bot["sent"] == []


def test_start_shows_shop_buttons_in_user_language(client, bot):
    assert hook(client, message("/start", lang="ru")).status_code == 200
    sent = bot["sent"][-1]
    assert sent["chat_id"] == 555 and "Здравствуйте, Aziz" in sent["text"]
    buttons = [b for row in sent["reply_markup"]["inline_keyboard"] for b in row]
    assert buttons[0]["web_app"]["url"] == "https://shop.example.uz/store"
    assert buttons[-1]["callback_data"] == "orders"
    # Oddiy matn — do'kon tugmasi bilan yo'l-yo'riq
    hook(client, message("salom"))
    assert "Do'konni ochish" in bot["sent"][-1]["text"]


def test_shop_deep_link_opens_factory(client, bot, shop):  # noqa: F811
    status = client.get(f"{API}/telegram/status", headers=shop["owner"]).json()
    assert status["shop_url"] == f"https://t.me/tc_test_bot?start=shop{shop['factory_id']}"
    hook(client, message(f"/start shop{shop['factory_id']}"))
    sent = bot["sent"][-1]
    assert "Alpha Textile" in sent["text"]
    assert sent["reply_markup"]["inline_keyboard"][0][0]["web_app"]["url"].endswith(f"/store/factories/{shop['factory_id']}")
    hook(client, message("/start shop99999"))  # yo'q zavod — umumiy do'kon
    assert "tikuv fabrikalari katalogi" in bot["sent"][-1]["text"]


def test_factory_link_via_webhook(client, bot):
    owner, factory_id = register_owner(client, "owner@t.uz", "Tele Tekstil")
    code = client.get(f"{API}/telegram/status", headers=owner).json()["link_url"].split("start=")[1]
    # Webhook yoqilgan: Start bosilmagan bo'lsa "Tekshirish" — 404 (502 emas)
    assert client.post(f"{API}/telegram/check", headers=owner).status_code == 404
    hook(client, message(f"/start f{factory_id}-0000000000", chat_id=1))  # soxta imzo
    assert "noto'g'ri" in bot["sent"][-1]["text"]
    hook(client, message(f"/start@tc_test_bot {code}", chat_id=-100, lang="en", chat_type="group"))
    assert "connected" in bot["sent"][-1]["text"]
    with SessionLocal() as db:
        f = db.get(Factory, factory_id)
        assert (f.telegram_chat_id, f.telegram_lang) == ("-100", "en")
    assert client.post(f"{API}/telegram/check", headers=owner).json()["linked"] is True
    # Guruhdagi boshqa xabarlarga bot javob bermaydi
    n = len(bot["sent"])
    hook(client, message("salom", chat_id=-100, chat_type="group"))
    assert len(bot["sent"]) == n


def test_mini_app_order_notifies_customer(client, bot, shop):  # noqa: F811
    r = checkout(client, shop, telegram_init_data=init_data(user_id=555))
    assert r.status_code == 201
    token = r.json()["order"]["public_token"]
    with SessionLocal() as db:
        order = db.query(Order).filter_by(public_token=token).one()
        # Xabarlar tili — Mini App yuborgan sayt tili (Accept-Language), standart o'zbekcha
        assert (order.customer_telegram_id, order.customer_lang) == ("555", "uz")

    pay(client, token)
    paid = bot["sent"][-1]
    assert paid["chat_id"] == "555" and "To'lov qabul qilindi" in paid["text"] and "Alpha Textile" in paid["text"]

    order_id = client.get(f"{API}/orders", headers=shop["owner"]).json()["items"][0]["id"]
    n = len(bot["sent"])
    client.patch(f"{API}/orders/{order_id}/status", headers=shop["owner"], json={"status": "CONFIRMED"})
    assert len(bot["sent"]) == n + 1 and "Tasdiqlandi" in bot["sent"][-1]["text"]
    # Rad etilgan o'zgarish (orqaga) — xabar yo'q
    assert client.patch(f"{API}/orders/{order_id}/status", headers=shop["owner"], json={"status": "NEW"}).status_code == 409
    assert len(bot["sent"]) == n + 1

    # To'lanmagan buyurtma ham shu mijozniki, lekin ro'yxatda ko'rinmaydi
    checkout(client, shop, telegram_init_data=init_data(user_id=555))
    # "Buyurtmalarim": faqat shu mijozning to'langan buyurtmalari
    hook(client, {"callback_query": {"id": "cb1", "data": "orders", "from": {"id": 555, "language_code": "en"},
                                     "message": {"chat": {"id": 555}}}})
    text = bot["sent"][-1]["text"]
    assert "Your orders" in text and "Confirmed" in text and text.count("B-") == 1
    hook(client, message("/orders", chat_id=777))
    assert "buyurtmalaringiz yo'q" in bot["sent"][-1]["text"]


def test_mini_app_order_language_from_request(client, bot, shop):  # noqa: F811
    r = client.post(f"{API}/store/orders", headers={"Accept-Language": "ru"}, json={
        "factory_id": shop["factory_id"], "items": [{"product_id": shop["polo"]["id"], "quantity": 1}],
        "customer_name": "Aziz", "customer_phone": "+998 90 123 45 67", "telegram_init_data": init_data()})
    pay(client, r.json()["order"]["public_token"])
    assert "Оплата получена" in bot["sent"][-1]["text"]


@pytest.mark.parametrize("data", ["bad", None, "__FORGED__", "__OLD__"])
def test_invalid_init_data_ignored(client, bot, shop, data):  # noqa: F811
    if data == "__FORGED__":
        data = init_data(token="999:other")
    elif data == "__OLD__":
        data = init_data(age=2 * 24 * 3600)
    r = checkout(client, shop, telegram_init_data=data)
    assert r.status_code == 201  # buyurtma baribir yaratiladi, faqat Telegram'ga bog'lanmaydi
    with SessionLocal() as db:
        assert db.query(Order).filter_by(public_token=r.json()["order"]["public_token"]).one().customer_telegram_id is None


def test_setup_requires_superadmin(client, bot):
    owner, _ = register_owner(client, "owner@t.uz", "Tele")
    assert client.post(f"{API}/telegram/setup", headers=owner).status_code == 403
    admin = auth(client, ADMIN_EMAIL)
    r = client.post(f"{API}/telegram/setup", headers=admin)
    assert r.status_code == 200 and r.json()["webhook"] == "https://shop.example.uz/api/v1/telegram/webhook"
    calls = dict(bot["calls"])
    assert calls["setWebhook"]["secret_token"] == telegram_service.webhook_secret()
    assert calls["setChatMenuButton"]["menu_button"]["web_app"]["url"] == "https://shop.example.uz/store"
