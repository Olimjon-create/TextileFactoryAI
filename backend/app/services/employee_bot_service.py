"""Xodimning Telegram kabineti: javob so'rash va rahbarning botdan tasdiqlashi.

Bot suhbat holatini saqlamaydi. Xodim tugmalar bilan turini va kunlarini tanlaydi, keyin bot "sababini yozing"
savolini ForceReply bilan yuboradi — tanlangan tur va sanalar savol matnining oxirida `#L TUR BOSHI OXIRI` belgisi
sifatida turadi. Xodim shu xabarga javob yozganda belgi reply_to_message dan o'qiladi (bot xabarini foydalanuvchi
o'zgartira olmaydi). So'rov attendance_service.create_leave orqali yaratiladi — tekshiruvlar bir joyda qoladi.
"""

import re
from datetime import date, timedelta

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.i18n import t_lang
from app.models import Employee, Factory, LeaveRequest
from app.models.attendance import LeaveType
from app.models.resources import EmployeeStatus
from app.schemas.attendance import LeaveCreate, LeaveDecision
from app.services import telegram_service

LEAVE_NAMES = {
    LeaveType.PERSONAL: "Shaxsiy ish",
    LeaveType.FAMILY: "Oilaviy sabab",
    LeaveType.SICK: "Kasallik",
    LeaveType.VACATION: "Ta'til",
    LeaveType.OTHER: "Boshqa",
}
# (yorliq, bugundan necha kun keyin boshlanadi, necha kun)
PERIODS = (
    ("Bugun", 0, 1),
    ("Ertaga", 1, 1),
    ("Bugun va ertaga", 0, 2),
    ("3 kun (bugundan)", 0, 3),
    ("1 hafta (ertadan)", 1, 7),
)
MAX_DAYS = 7
_MARKER = re.compile(r"#L ([A-Z]+) (\d{4}-\d{2}-\d{2}) (\d{4}-\d{2}-\d{2})\s*$")


def period_text(start: date, end: date) -> str:
    return start.strftime("%d.%m.%Y") + (f" — {end.strftime('%d.%m.%Y')}" if end != start else "")


def _employee(db: Session, chat_id) -> Employee | None:
    employee = telegram_service.employee_by_chat(db, chat_id)
    if employee is None or employee.status not in (EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE):
        return None
    return employee


def _not_connected(chat_id, lang: str) -> None:
    telegram_service.send_to_chat(chat_id, lang, "Siz xodim sifatida ulanmagansiz. Rahbaringizdan shaxsiy havolani so'rang.")


# --- Xodim tomoni ------------------------------------------------------------------------------------


def leave_menu(db: Session, chat_id, lang: str) -> None:
    if _employee(db, chat_id) is None:
        _not_connected(chat_id, lang)
        return
    buttons = [{"text": t_lang(lang, name), "callback_data": f"lt:{kind.value}"} for kind, name in LEAVE_NAMES.items()]
    telegram_service.send_to_chat(chat_id, lang, "📝 <b>Javob so'rash</b>\n\nSababi qanday?",
                                  reply_markup={"inline_keyboard": [buttons[i:i + 2] for i in range(0, len(buttons), 2)]})


def _choose_period(chat_id, lang: str, kind: LeaveType) -> None:
    rows = [[{"text": t_lang(lang, label), "callback_data": f"ld:{kind.value}:{offset}:{days}"}] for label, offset, days in PERIODS]
    telegram_service.send_to_chat(chat_id, lang, "📅 Qaysi kunlarga? ({kind})", reply_markup={"inline_keyboard": rows},
                                  kind=t_lang(lang, LEAVE_NAMES[kind]))


def _ask_reason(chat_id, lang: str, kind: LeaveType, offset: int, days: int) -> None:
    start = telegram_service.tashkent_today() + timedelta(days=offset)
    end = start + timedelta(days=days - 1)
    telegram_service.send_to_chat(
        chat_id, lang,
        "✍️ Sababini shu xabarga javob qilib yozing.\n\n{kind}: {period}\n{marker}",
        reply_markup={"force_reply": True, "input_field_placeholder": t_lang(lang, "Sabab...")},
        kind=t_lang(lang, LEAVE_NAMES[kind]), period=period_text(start, end),
        marker=f"#L {kind.value} {start.isoformat()} {end.isoformat()}",
    )


def handle_employee_callback(db: Session, cq: dict, lang: str) -> None:
    """"lv" (menyu), "lt:<TUR>" (tur tanlandi), "ld:<TUR>:<siljish>:<kun>" (kunlar tanlandi)."""
    telegram_service.answer_callback(cq)
    chat_id = ((cq.get("message") or {}).get("chat") or {}).get("id") or (cq.get("from") or {}).get("id")
    if not chat_id:
        return
    parts = (cq.get("data") or "").split(":")
    if parts[0] == "lv":
        leave_menu(db, chat_id, lang)
        return
    if _employee(db, chat_id) is None:
        _not_connected(chat_id, lang)
        return
    if len(parts) < 2 or parts[1] not in LeaveType.__members__:
        return
    kind = LeaveType(parts[1])
    if parts[0] == "lt":
        _choose_period(chat_id, lang, kind)
    elif parts[0] == "ld" and len(parts) == 4 and parts[2].isdigit() and parts[3].isdigit():
        offset, days = int(parts[2]), int(parts[3])
        if offset <= 7 and 1 <= days <= MAX_DAYS:
            _ask_reason(chat_id, lang, kind, offset, days)


def handle_reply(db: Session, msg: dict, lang: str) -> bool:
    """Bot savoliga javob. Javob so'rovi belgisi bo'lmasa False — bot odatdagi javobini beradi."""
    replied = msg.get("reply_to_message") or {}
    match = _MARKER.search(replied.get("text") or "")
    if not (replied.get("from") or {}).get("is_bot") or match is None:
        return False
    chat_id = msg["chat"]["id"]
    employee = _employee(db, chat_id)
    if employee is None:
        _not_connected(chat_id, lang)
        return True
    reason = (msg.get("text") or "").strip()
    if len(reason) < 2:
        telegram_service.send_to_chat(chat_id, lang, "Sababini matn bilan yozing (kamida 2 belgi).")
        return True
    kind_code, start_s, end_s = match.groups()
    start, end = date.fromisoformat(start_s), date.fromisoformat(end_s)
    if kind_code not in LeaveType.__members__ or start < telegram_service.tashkent_today() or (end - start).days >= MAX_DAYS:
        telegram_service.send_to_chat(chat_id, lang, "So'rov eskirgan. Qaytadan boshlang: /leave")
        return True
    actor = telegram_service.factory_actor(db, employee.factory_id)
    if actor is None:
        telegram_service.send_to_chat(chat_id, lang, "Amalni bajarib bo'lmadi")
        return True
    from app.services import attendance_service

    try:
        attendance_service.create_leave(db, actor, LeaveCreate(
            employee_id=employee.id, leave_type=LeaveType(kind_code), start_date=start, end_date=end, reason=reason[:500],
        ), via_bot=True)
    except HTTPException as exc:
        db.rollback()
        telegram_service.send_to_chat(chat_id, lang, str(exc.detail))
        return True
    except ValidationError:
        telegram_service.send_to_chat(chat_id, lang, "So'rov eskirgan. Qaytadan boshlang: /leave")
        return True
    telegram_service.send_to_chat(
        chat_id, lang, "✅ So'rovingiz rahbarga yuborildi: {kind}, {period}. Javob shu yerga keladi.",
        kind=t_lang(lang, LEAVE_NAMES[LeaveType(kind_code)]), period=period_text(start, end),
    )
    return True


def notify_decision(db: Session, lr: LeaveRequest) -> None:
    """Rahbar qaroridan keyin (saytda yoki botda) xodimga xabar — agar botga ulangan bo'lsa."""
    employee = db.get(Employee, lr.employee_id)
    if employee is None or not employee.telegram_chat_id:
        return
    lang = employee.telegram_lang or "uz"
    from app.models.attendance import LeaveStatus

    template = ("✅ Javob so'rovingiz tasdiqlandi: {period}{note}" if lr.status == LeaveStatus.APPROVED
                else "❌ Javob so'rovingiz rad etildi: {period}{note}")
    note = f"\n{t_lang(lang, 'Izoh')}: {lr.decision_note}" if lr.decision_note else ""
    telegram_service.send_to_chat(employee.telegram_chat_id, lang, template,
                                  period=period_text(lr.start_date, lr.end_date), note=note)


# --- Rahbar tomoni (zavod chati) --------------------------------------------------------------------


def decision_keyboard(leave_id: int, lang: str) -> dict:
    return {"inline_keyboard": [[
        {"text": t_lang(lang, "✅ Tasdiqlash"), "callback_data": f"l:a:{leave_id}"},
        {"text": t_lang(lang, "❌ Rad etish"), "callback_data": f"l:r:{leave_id}"},
    ]]}


def handle_decision(db: Session, cq: dict) -> None:
    """Zavod chatidagi "l:a:<id>" / "l:r:<id>" tugmalari."""
    from app.services import attendance_service

    parts = (cq.get("data") or "").split(":")
    if len(parts) != 3 or parts[1] not in ("a", "r") or not parts[2].isdigit():
        telegram_service.answer_callback(cq)
        return
    leave_id = int(parts[2])
    chat_id = str(((cq.get("message") or {}).get("chat") or {}).get("id", ""))
    lr = db.get(LeaveRequest, leave_id)
    factory = db.get(Factory, lr.factory_id) if lr else None
    if factory is None or not factory.telegram_chat_id or factory.telegram_chat_id != chat_id:
        telegram_service.answer_callback(cq, t_lang("uz", "Ruxsat yo'q"), alert=True)
        return
    lang = factory.telegram_lang or "uz"
    actor = telegram_service.factory_actor(db, factory.id)
    if actor is None:
        telegram_service.answer_callback(cq, t_lang(lang, "Amalni bajarib bo'lmadi"), alert=True)
        return
    try:
        if parts[1] == "a":
            attendance_service.approve_leave(db, actor, leave_id, LeaveDecision())
            label = t_lang(lang, "✅ Tasdiqlandi")
        else:
            attendance_service.reject_leave(db, actor, leave_id, LeaveDecision())
            label = t_lang(lang, "❌ Rad etildi")
    except HTTPException as exc:
        db.rollback()
        telegram_service.answer_callback(cq, t_lang(lang, str(exc.detail)), alert=True)
        return
    telegram_service.edit_callback_markup(cq, {"inline_keyboard": [[{"text": label, "callback_data": "o:done"}]]})
    telegram_service.answer_callback(cq, label)
