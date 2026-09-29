"""Telegram bildirishnomalar: zavod o'z chatini botga ulaydi, muhim hodisalar shu chatga yuboriladi.

Ulash webhook'siz: foydalanuvchi t.me/<bot>?start=<kod> havolasini ochib Start bosadi,
"Tekshirish" tugmasi getUpdates orqali o'sha kodli /start xabarini topib chat_id ni saqlaydi.
Kod zavod id'sidan HMAC bilan hosil qilinadi — boshqa zavod kodini taxmin qilib bo'lmaydi.

Yuborish xatosi asosiy amalni to'xtatmaydi (buyurtma saqlanadi, xabar ketmay qolishi mumkin).
"""

import hashlib
import hmac
import html
from functools import lru_cache

import requests
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.i18n import get_lang, t, t_lang
from app.models import Factory

API = "https://api.telegram.org/bot{token}/{method}"


def _call(method: str, timeout: float = 6, **params) -> dict:
    response = requests.post(API.format(token=settings.TELEGRAM_BOT_TOKEN.strip(), method=method), json=params, timeout=timeout)
    data = response.json()
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method}: {data.get('description')}")
    return data["result"]


@lru_cache(maxsize=1)
def _bot_username(token: str) -> str:
    return _call("getMe")["username"]


def bot_username() -> str | None:
    if not settings.telegram_enabled:
        return None
    try:
        return _bot_username(settings.TELEGRAM_BOT_TOKEN.strip())
    except Exception as exc:  # noqa: BLE001
        print(exc)
        return None


def link_code(factory_id: int) -> str:
    sig = hmac.new(settings.JWT_SECRET_KEY.encode(), f"tg:{factory_id}".encode(), hashlib.sha256).hexdigest()[:10]
    return f"f{factory_id}-{sig}"


def status_for(factory: Factory) -> dict:
    username = bot_username()
    return {
        "enabled": settings.telegram_enabled,
        "bot_username": username,
        "linked": bool(factory.telegram_chat_id),
        "link_url": f"https://t.me/{username}?start={link_code(factory.id)}" if username else None,
    }


def check_link(db: Session, factory: Factory) -> dict:
    """Botga yuborilgan "/start <kod>" xabarini topib, chatni zavodga bog'laydi."""
    if not settings.telegram_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, t("Telegram bot sozlanmagan"))
    code = link_code(factory.id)
    try:
        updates = _call("getUpdates", timeout=10, allowed_updates=["message"])
    except Exception as exc:  # noqa: BLE001
        print(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, t("Telegram bilan bog'lanib bo'lmadi, keyinroq urinib ko'ring"))
    chat_id = None
    for upd in reversed(updates):
        msg = upd.get("message") or {}
        # Shaxsiy chat: "/start KOD"; guruhda: "/start@BotNomi KOD"
        parts = (msg.get("text") or "").split()
        if len(parts) == 2 and parts[0].split("@")[0] == "/start" and parts[1] == code:
            chat_id = str(msg["chat"]["id"])
            break
    if chat_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("Botda «Start» bosilmagan — havolani ochib, Start tugmasini bosing va qayta tekshiring"))
    factory.telegram_chat_id, factory.telegram_lang = chat_id, get_lang()
    db.commit()
    send(factory, "TextileCore bildirishnomalari ulandi: {factory}", factory=factory.name)
    return status_for(factory)


def unlink(db: Session, factory: Factory) -> dict:
    factory.telegram_chat_id = None
    db.commit()
    return status_for(factory)


def send(target: Factory | None, template: str, /, **kwargs) -> bool:
    """Zavod chatiga xabar (zavod tanlagan tilda). Ulanmagan/sozlanmagan bo'lsa — jim o'tadi.
    Pozitsion parametrlar: shablonda {factory} kabi nomlar bemalol ishlatiladi."""
    if target is None or not target.telegram_chat_id or not settings.telegram_enabled:
        return False
    lang = target.telegram_lang or "uz"
    safe = {k: html.escape(str(v)) for k, v in kwargs.items()}
    text = t_lang(lang, template, **safe)
    try:
        _call("sendMessage", timeout=5, chat_id=target.telegram_chat_id, text=text, parse_mode="HTML",
              disable_web_page_preview=True)
        return True
    except Exception as exc:  # noqa: BLE001 — xabar ketmasa ham asosiy amal davom etadi
        print(exc)
        return False


def notify(db: Session, factory_id: int | None, template: str, /, **kwargs) -> None:
    if factory_id is None or not settings.telegram_enabled:
        return
    send(db.get(Factory, factory_id), template, **kwargs)
