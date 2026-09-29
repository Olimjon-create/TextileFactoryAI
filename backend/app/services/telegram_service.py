"""Telegram bot: zavodlarga bildirishnomalar va mijozlar uchun do'kon (Mini App).

Zavodni ulash: foydalanuvchi t.me/<bot>?start=<kod> havolasini ochib Start bosadi. Webhook sozlangan
bo'lsa bot shu zahoti bog'laydi; aks holda (lokal ishlab chiqish) "Tekshirish" tugmasi getUpdates orqali
o'sha kodli /start xabarini topadi. Kod zavod id'sidan bot tokeni bilan HMAC orqali hosil qilinadi — boshqa zavod kodini
taxmin qilib bo'lmaydi.

Mijozlar: bot "Do'konni ochish" tugmasi bilan saytdagi katalogni Telegram ichida (Mini App) ochadi.
Mini App'dan berilgan buyurtmaga mijozning Telegram id'si (imzosi tekshirilgan initData'dan) yoziladi —
to'lov va holat o'zgarishlari haqida mijozga shu botdan xabar boradi.

Yuborish xatosi asosiy amalni to'xtatmaydi (buyurtma saqlanadi, xabar ketmay qolishi mumkin).
"""

import hashlib
import hmac
import html
import json
import time
from functools import lru_cache
from urllib.parse import parse_qsl

import requests
from fastapi import HTTPException, status
from sqlalchemy import event, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.i18n import get_lang, t, t_lang
from app.models import Factory, Order
from app.models.order import OrderStatus, PaymentStatus

API = "https://api.telegram.org/bot{token}/{method}"
INIT_DATA_MAX_AGE = 24 * 3600

STATUS_LABELS = {
    OrderStatus.PENDING_PAYMENT: "To'lov kutilmoqda",
    OrderStatus.NEW: "Qabul qilindi",
    OrderStatus.CONFIRMED: "Tasdiqlandi",
    OrderStatus.IN_PRODUCTION: "Tikilmoqda",
    OrderStatus.READY: "Tayyor",
    OrderStatus.SHIPPED: "Yo'lga chiqdi",
    OrderStatus.COMPLETED: "Yetkazildi",
    OrderStatus.CANCELLED: "Bekor qilindi",
}


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
    except Exception as exc:
        print(exc)
        return None


def _sign(purpose: str) -> str:
    return hmac.new(settings.TELEGRAM_BOT_TOKEN.strip().encode(), purpose.encode(), hashlib.sha256).hexdigest()


def link_code(factory_id: int) -> str:
    return f"f{factory_id}-{_sign(f'tg:{factory_id}')[:10]}"


def webhook_secret() -> str:
    """Telegram har so'rovda X-Telegram-Bot-Api-Secret-Token sarlavhasida qaytaradi."""
    return _sign("tg-webhook")[:48]


def _lang(code: str | None) -> str:
    code = (code or "").lower()
    return "ru" if code.startswith("ru") else "en" if code.startswith("en") else "uz"


def status_for(factory: Factory) -> dict:
    username = bot_username()
    return {
        "enabled": settings.telegram_enabled,
        "bot_username": username,
        "linked": bool(factory.telegram_chat_id),
        "link_url": f"https://t.me/{username}?start={link_code(factory.id)}" if username else None,
        "shop_url": f"https://t.me/{username}?start=shop{factory.id}" if username else None,
    }


def _link(db: Session, factory: Factory, chat_id: str, lang: str) -> None:
    factory.telegram_chat_id, factory.telegram_lang = chat_id, lang
    db.commit()
    send(factory, "TextileCore bildirishnomalari ulandi: {factory}", factory=factory.name)


def check_link(db: Session, factory: Factory) -> dict:
    """Zavod chati bog'langanini tekshiradi. Webhook ishlasa — bot allaqachon bog'lagan bo'ladi;
    bo'lmasa botga yuborilgan "/start <kod>" xabarini getUpdates orqali qidiradi."""
    if not settings.telegram_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, t("Telegram bot sozlanmagan"))
    db.refresh(factory)
    if factory.telegram_chat_id:
        return status_for(factory)
    code = link_code(factory.id)
    try:
        updates = _call("getUpdates", timeout=10, allowed_updates=["message"])
    except RuntimeError as exc:
        if "webhook" not in str(exc).lower():
            print(exc)
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, t("Telegram bilan bog'lanib bo'lmadi, keyinroq urinib ko'ring"))
        updates = []
    except Exception as exc:
        print(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, t("Telegram bilan bog'lanib bo'lmadi, keyinroq urinib ko'ring"))
    for upd in reversed(updates):
        msg = upd.get("message") or {}
        parts = (msg.get("text") or "").split()
        if len(parts) == 2 and parts[0].split("@")[0] == "/start" and parts[1] == code:
            _link(db, factory, str(msg["chat"]["id"]), get_lang())
            return status_for(factory)
    raise HTTPException(status.HTTP_404_NOT_FOUND, t("Botda «Start» bosilmagan — havolani ochib, Start tugmasini bosing va qayta tekshiring"))


def unlink(db: Session, factory: Factory) -> dict:
    factory.telegram_chat_id = None
    db.commit()
    return status_for(factory)


def _send_chat(chat_id: str | int, lang: str, template: str, /, reply_markup: dict | None = None, **kwargs) -> bool:
    safe = {k: html.escape(str(v)) for k, v in kwargs.items()}
    params = {"chat_id": chat_id, "text": t_lang(lang, template, **safe), "parse_mode": "HTML", "disable_web_page_preview": True}
    if reply_markup:
        params["reply_markup"] = reply_markup
    try:
        _call("sendMessage", timeout=5, **params)
        return True
    except Exception as exc:
        print(exc)
        return False


def send(target: Factory | None, template: str, /, **kwargs) -> bool:
    """Zavod chatiga xabar (zavod tanlagan tilda). Ulanmagan/sozlanmagan bo'lsa — jim o'tadi.
    Pozitsion parametrlar: shablonda {factory} kabi nomlar bemalol ishlatiladi."""
    if target is None or not target.telegram_chat_id or not settings.telegram_enabled:
        return False
    return _send_chat(target.telegram_chat_id, target.telegram_lang or "uz", template, **kwargs)


def notify(db: Session, factory_id: int | None, template: str, /, **kwargs) -> None:
    if factory_id is None or not settings.telegram_enabled:
        return
    send(db.get(Factory, factory_id), template, **kwargs)


def verify_init_data(init_data: str | None) -> dict | None:
    """Mini App'ning initData'si: imzo bot tokeni bilan tekshiriladi (core.telegram.org/bots/webapps).
    To'g'ri bo'lsa — Telegram foydalanuvchisi (id, language_code, …), aks holda None."""
    if not init_data or not settings.telegram_enabled:
        return None
    try:
        fields = dict(parse_qsl(init_data, strict_parsing=True))
        received = fields.pop("hash", "")
        check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
        secret = hmac.new(b"WebAppData", settings.TELEGRAM_BOT_TOKEN.strip().encode(), hashlib.sha256).digest()
        expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, received):
            return None
        if time.time() - int(fields.get("auth_date", "0")) > INIT_DATA_MAX_AGE:
            return None
        user = json.loads(fields.get("user", "{}"))
        return user if user.get("id") else None
    except (ValueError, TypeError):
        return None


def _money(order: Order) -> str:
    return f"{float(order.total_amount):,.0f} {order.currency}".replace(",", " ")


def notify_customer_paid(order: Order) -> None:
    if order.customer_telegram_id and settings.telegram_enabled:
        _send_chat(order.customer_telegram_id, order.customer_lang or "uz",
                   "✅ To'lov qabul qilindi!\nBuyurtma <b>{number}</b> · {factory}\n{amount}\n\nHolati o'zgarganda shu yerga xabar beramiz.",
                   number=order.order_number, factory=order.factory.name, amount=_money(order))


_PENDING_KEY = "tg_customer_messages"


def queue_customer_status(db: Session, order: Order, new_status: OrderStatus) -> None:
    """Holat o'zgarishi haqidagi xabar commit'dan KEYIN yuboriladi (rollback bo'lsa — yuborilmaydi)."""
    if not order.customer_telegram_id or not settings.telegram_enabled or order.payment_status != PaymentStatus.PAID:
        return
    lang = order.customer_lang or "uz"
    db.info.setdefault(_PENDING_KEY, []).append((
        order.customer_telegram_id, lang, order.order_number, order.factory.name, t_lang(lang, STATUS_LABELS[new_status]),
    ))


@event.listens_for(Session, "after_commit")
def _flush_customer_messages(session: Session) -> None:
    for chat_id, lang, number, factory, label in session.info.pop(_PENDING_KEY, []):
        _send_chat(chat_id, lang, "📦 Buyurtma <b>{number}</b> ({factory}): {status}", number=number, factory=factory, status=label)


@event.listens_for(Session, "after_rollback")
def _drop_customer_messages(session: Session) -> None:
    session.info.pop(_PENDING_KEY, None)


def _site(base_url: str) -> str:
    url = (settings.APP_URL or base_url).rstrip("/")
    return "https://" + url.split("://", 1)[-1]


def _shop_keyboard(lang: str, site: str, factory: Factory | None = None) -> dict:
    rows = []
    if factory is not None:
        rows.append([{"text": t_lang(lang, "🛍 Do'konni ochish"), "web_app": {"url": f"{site}/store/factories/{factory.id}"}}])
        rows.append([{"text": t_lang(lang, "🏭 Barcha fabrikalar"), "web_app": {"url": f"{site}/store"}}])
    else:
        rows.append([{"text": t_lang(lang, "🛍 Do'konni ochish"), "web_app": {"url": f"{site}/store"}}])
    rows.append([{"text": t_lang(lang, "📦 Buyurtmalarim"), "callback_data": "orders"}])
    return {"inline_keyboard": rows}


def _orders_text(db: Session, telegram_id: str, lang: str) -> str:
    orders = db.scalars(
        select(Order)
        .options(selectinload(Order.factory))
        .where(Order.customer_telegram_id == telegram_id, Order.payment_status == PaymentStatus.PAID)
        .order_by(Order.id.desc())
        .limit(10)
    ).all()
    if not orders:
        return t_lang(lang, "Hozircha buyurtmalaringiz yo'q. «Do'konni ochish» tugmasi orqali buyurtma bering.")
    items = [f"<b>{o.order_number}</b> · {html.escape(o.factory.name)}\n"
             f"{_money(o)} — {t_lang(lang, STATUS_LABELS[o.status])}" for o in orders]
    return "\n\n".join([t_lang(lang, "📦 <b>Buyurtmalaringiz</b>"), *items])


def _send_raw(chat_id: int | str, text: str, reply_markup: dict | None = None) -> None:
    params = {"chat_id": chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
    if reply_markup:
        params["reply_markup"] = reply_markup
    try:
        _call("sendMessage", timeout=5, **params)
    except Exception as exc:
        print(exc)


def _public_factory(db: Session, factory_id: int) -> Factory | None:
    factory = db.get(Factory, factory_id)
    return factory if factory is not None and factory.is_active and factory.is_public else None


def _handle_start(db: Session, chat: dict, user: dict, arg: str, lang: str, site: str) -> None:
    chat_id = chat["id"]
    name = user.get("first_name") or ""
    if arg.startswith("f") and "-" in arg:
        try:
            factory_id = int(arg[1:].split("-", 1)[0])
        except ValueError:
            factory_id = 0
        factory = db.get(Factory, factory_id) if factory_id else None
        if factory is not None and hmac.compare_digest(link_code(factory_id), arg):
            _link(db, factory, str(chat_id), lang)
        else:
            _send_chat(chat_id, lang, "Havola noto'g'ri yoki eskirgan. Saytda Sozlamalar → Telegram bo'limidan qayta oching.")
        return
    if chat.get("type") != "private":
        return
    factory = None
    if arg.startswith("shop"):
        try:
            factory = _public_factory(db, int(arg[4:]))
        except ValueError:
            factory = None
    if factory is not None:
        _send_chat(chat_id, lang,
                   "👋 Assalomu alaykum, {name}!\n\n<b>{factory}</b> do'koniga xush kelibsiz.\n\n🛍 «Do'konni ochish» tugmasini bosing: mahsulotni tanlang, savatga qo'shing va to'lang.\n📦 Buyurtmangiz holati haqida shu yerga xabar beramiz.",
                   reply_markup=_shop_keyboard(lang, site, factory), name=name, factory=factory.name)
    else:
        _send_chat(chat_id, lang,
                   "👋 Assalomu alaykum, {name}!\n\n<b>TextileCore</b> — tikuv fabrikalari katalogi. Kiyimlarni to'g'ridan-to'g'ri ishlab chiqaruvchidan buyurtma qiling.\n\n🛍 «Do'konni ochish» tugmasini bosing: mahsulotni tanlang, savatga qo'shing va to'lang.\n📦 Buyurtmangiz holati haqida shu yerga xabar beramiz.",
                   reply_markup=_shop_keyboard(lang, site), name=name)


def handle_update(db: Session, update: dict, base_url: str) -> None:
    """Webhook orqali kelgan bitta yangilanish. Xatolar yutiladi — Telegram qayta yubormasligi uchun."""
    site = _site(base_url)
    if (cq := update.get("callback_query")) is not None:
        user = cq.get("from") or {}
        lang = _lang(user.get("language_code"))
        try:
            _call("answerCallbackQuery", timeout=5, callback_query_id=cq["id"])
        except Exception as exc:
            print(exc)
        chat_id = (cq.get("message") or {}).get("chat", {}).get("id") or user.get("id")
        if cq.get("data") == "orders" and chat_id:
            _send_raw(chat_id, _orders_text(db, str(user["id"]), lang), _shop_keyboard(lang, site))
        return

    msg = update.get("message")
    if not msg or "chat" not in msg:
        return
    chat, user = msg["chat"], msg.get("from") or {}
    lang = _lang(user.get("language_code"))
    parts = (msg.get("text") or "").split()
    command = parts[0].split("@")[0].lower() if parts and parts[0].startswith("/") else ""
    if command == "/start":
        _handle_start(db, chat, user, parts[1] if len(parts) > 1 else "", lang, site)
    elif chat.get("type") != "private":
        return
    elif command == "/orders":
        _send_raw(chat["id"], _orders_text(db, str(user.get("id")), lang), _shop_keyboard(lang, site))
    elif not command and msg.get("text") and settings.assistant_enabled:
        _answer_with_assistant(db, chat["id"], user, msg["text"], lang, site)
    else:
        _send_chat(chat["id"], lang, "Buyurtma berish uchun «Do'konni ochish» tugmasini bosing 👇",
                   reply_markup=_shop_keyboard(lang, site))


def _answer_with_assistant(db: Session, chat_id: int, user: dict, text: str, lang: str, site: str) -> None:
    from app.core import rate_limit
    from app.services import assistant_service

    try:
        rate_limit.hit(f"tg-assistant:{user.get('id')}", 20, 3600)
        _call("sendChatAction", timeout=5, chat_id=chat_id, action="typing")
        reply, products = assistant_service.ask(db, [{"role": "user", "content": text[:2000]}], lang)
    except HTTPException as exc:
        _send_raw(chat_id, html.escape(str(exc.detail)), _shop_keyboard(lang, site))
        return
    except Exception as exc:
        print("tg assistant:", exc)
        _send_chat(chat_id, lang, "Buyurtma berish uchun «Do'konni ochish» tugmasini bosing 👇", reply_markup=_shop_keyboard(lang, site))
        return
    rows = [[{"text": f"{p.name} · {p.price:,.0f} so'm".replace(",", " "),
              "web_app": {"url": f"{site}/store/factories/{p.factory_id}?product={p.id}"}}] for p in products]
    keyboard = _shop_keyboard(lang, site)
    keyboard["inline_keyboard"] = rows + keyboard["inline_keyboard"]
    _send_raw(chat_id, html.escape(reply), keyboard)


def setup_bot(base_url: str) -> dict:
    """Webhook, "Do'kon" menyu tugmasi va buyruqlar ro'yxatini o'rnatadi (bir marta, deploy'dan keyin)."""
    if not settings.telegram_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, t("Telegram bot sozlanmagan"))
    site = _site(base_url)
    webhook = f"{site}{settings.API_V1_PREFIX}/telegram/webhook"
    _call("setWebhook", timeout=10, url=webhook, secret_token=webhook_secret(),
          allowed_updates=["message", "callback_query"], drop_pending_updates=True)
    _call("setChatMenuButton", menu_button={"type": "web_app", "text": t_lang("uz", "🛍 Do'kon"), "web_app": {"url": f"{site}/store"}})
    for lang in ("uz", "ru", "en"):
        commands = [{"command": "start", "description": t_lang(lang, "Botni ulash")},
                    {"command": "orders", "description": t_lang(lang, "Buyurtmalarim")}]
        _call("setMyCommands", commands=commands, **({"language_code": lang} if lang != "uz" else {}))
    return {"webhook": webhook, "shop": f"{site}/store"}


_ALERT_COOLDOWN = 600
_last_alert: dict[str, float] = {}


def alert_admin(method: str, path: str, exc: BaseException) -> bool:
    """Kutilmagan server xatosi (500) haqida TELEGRAM_ADMIN_CHAT_ID ga qisqa xabar. So'rov tanasi yuborilmaydi."""
    chat_id = settings.TELEGRAM_ADMIN_CHAT_ID.strip()
    if not chat_id or not settings.telegram_enabled:
        return False
    key = f"{method} {path} {type(exc).__name__}"
    now = time.monotonic()
    if now - _last_alert.get(key, -_ALERT_COOLDOWN) < _ALERT_COOLDOWN:
        return False
    _last_alert[key] = now
    error = f"{type(exc).__name__}: {exc}"[:500]
    return _send_chat(chat_id, "uz", "🚨 <b>Server xatosi</b>\n{method} {path}\n<code>{error}</code>",
                      method=method, path=path, error=error)
