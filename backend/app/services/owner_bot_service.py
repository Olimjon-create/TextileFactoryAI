"""Zavod chatidagi rahbar buyruqlari: /report (bugungi hisobot hozir) va /absent (bugungi davomat).

Buyruq faqat zavodga ulangan chatdan (Sozlamalar → Telegram) bajariladi — boshqa chatlarga zavod ma'lumoti chiqmaydi.
"""

import html

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.i18n import t_lang
from app.models import Factory
from app.services import telegram_service

FACTORY_COMMANDS = ("/report", "/absent")
MAX_LINES = 40
_STATE_NAMES = {
    "NOT_MARKED": "belgilanmagan",
    "ABSENT": "kelmadi",
    "SICK": "kasal",
    "LEAVE": "javob olgan",
    "VACATION": "ta'tilda",
}


def _factory_for_chat(db: Session, chat_id) -> Factory | None:
    return db.scalar(select(Factory).where(Factory.telegram_chat_id == str(chat_id), Factory.is_active.is_(True)).limit(1))


def handle_command(db: Session, chat: dict, command: str, lang: str) -> None:
    factory = _factory_for_chat(db, chat["id"])
    if factory is None:
        if chat.get("type") == "private":
            telegram_service.send_to_chat(chat["id"], lang, "Bu buyruq faqat zavod chatida ishlaydi (saytda Sozlamalar → Telegram).")
        return
    if command == "/report":
        from app.services import daily_service

        daily_service.send_report(db, factory)
    else:
        send_absent(db, factory)


def absent_text(db: Session, factory: Factory) -> str | None:
    from app.services import attendance_service

    actor = telegram_service.factory_actor(db, factory.id)
    if actor is None:
        return None
    lang = factory.telegram_lang or "uz"
    board = attendance_service.daily_board(db, actor, factory_id=factory.id)
    s = board.summary
    missing = [r for r in board.rows if r.state in _STATE_NAMES]
    late = [r for r in board.rows if r.state == "LATE"]
    lines = [t_lang(lang, "📋 <b>Bugungi davomat</b> · {factory}\nKeldi: {present}/{total} · Kechikdi: {late} · Kelmagan/belgilanmagan: {missing}",
                    factory=html.escape(factory.name), present=s.present, total=s.total, late=s.late, missing=len(missing))]
    if missing:
        lines.append("\n" + t_lang(lang, "❌ <b>Ishda emas:</b>"))
        lines += [f"• {html.escape(r.employee.full_name)} — {t_lang(lang, _STATE_NAMES[r.state])}" for r in missing[:MAX_LINES]]
    if late:
        lines.append("\n" + t_lang(lang, "⏰ <b>Kechikkanlar:</b>"))
        lines += [f"• {html.escape(r.employee.full_name)} — {r.record.check_in.strftime('%H:%M')} (+{r.record.late_minutes})"
                  for r in late[:MAX_LINES] if r.record and r.record.check_in]
    if not missing and not late and s.total:
        lines.append("\n" + t_lang(lang, "✅ Hamma o'z vaqtida keldi."))
    return "\n".join(lines)


def send_absent(db: Session, factory: Factory) -> None:
    text = absent_text(db, factory)
    if text is None:
        telegram_service.send(factory, "Amalni bajarib bo'lmadi")
        return
    telegram_service.send_raw(factory.telegram_chat_id, text)
