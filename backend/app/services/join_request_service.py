"""Xodimlarning Telegram bot orqali ishga qo'shilishi.

1. Rahbar "Xodim qo'shish" sahifasidagi zavod havolasi/QR'ni xodimga beradi (t.me/<bot>?start=j<id>-<imzo>).
2. Xodim Start bosadi → bot "📱 Raqamni yuborish" tugmasini ko'rsatadi (ism va telefonni Telegram o'zi beradi,
   shuning uchun bot suhbat holatini saqlashi shart emas — faqat AWAITING_CONTACT yozuvi).
3. So'rov zavod chatiga bo'lim tugmalari va "Rad etish" bilan boradi; saytda ham ko'rinadi.
4. Qabul qilinganda Employee yaratiladi va shu Telegram chatiga ulanadi — xodim darhol /me dan foydalanadi.
"""

import hmac
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.i18n import t, t_lang
from app.core.scope import can_access, resolve_factory_id, scoped
from app.models import Employee, EmployeeJoinRequest, Factory, JoinRequestStatus, User
from app.models.resources import Department, EmployeeStatus
from app.schemas.join_request import JoinApprove, JoinLinkOut, JoinRequestOut
from app.schemas.resources import EmployeeCreate, EmployeeOut
from app.services import telegram_service, workforce_service

MAX_PENDING = 50

DEPARTMENT_NAMES = {
    Department.CUTTING: "Kesish",
    Department.SEWING: "Tikuv",
    Department.FINISHING: "Pardoz",
    Department.QUALITY_CONTROL: "Sifat nazorati",
    Department.PACKING: "Qadoqlash",
    Department.WAREHOUSE: "Ombor",
    Department.MAINTENANCE: "Mexaniklar",
    Department.ADMINISTRATION: "Ma'muriyat",
    Department.OTHER: "Boshqa",
}
BOT_DEPARTMENTS = (
    Department.SEWING, Department.CUTTING, Department.FINISHING, Department.QUALITY_CONTROL,
    Department.PACKING, Department.WAREHOUSE, Department.OTHER,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- Sayt tomoni -------------------------------------------------------------------------------------


def link_status(db: Session, actor: User, factory_id: int | None) -> JoinLinkOut:
    factory = db.get(Factory, resolve_factory_id(db, actor, factory_id))
    username = telegram_service.bot_username()
    pending = db.scalar(select(func.count(EmployeeJoinRequest.id)).where(
        EmployeeJoinRequest.factory_id == factory.id, EmployeeJoinRequest.status == JoinRequestStatus.NEW)) or 0
    return JoinLinkOut(
        enabled=settings.telegram_enabled,
        link_url=f"https://t.me/{username}?start={telegram_service.join_link_code(factory.id)}" if username else None,
        factory_linked=bool(factory.telegram_chat_id),
        pending=pending,
    )


def _out(r: EmployeeJoinRequest) -> JoinRequestOut:
    return JoinRequestOut(
        id=r.id, factory_id=r.factory_id, factory_name=r.factory.name, full_name=r.full_name or "",
        phone=r.phone, created_at=r.created_at,
    )


def list_pending(db: Session, actor: User, factory_id: int | None = None) -> list[JoinRequestOut]:
    query = scoped(
        select(EmployeeJoinRequest).options(selectinload(EmployeeJoinRequest.factory))
        .where(EmployeeJoinRequest.status == JoinRequestStatus.NEW)
        .order_by(EmployeeJoinRequest.created_at.desc(), EmployeeJoinRequest.id.desc()),
        actor, EmployeeJoinRequest.factory_id, factory_id,
    )
    return [_out(r) for r in db.scalars(query)]


def _get(db: Session, actor: User, request_id: int) -> EmployeeJoinRequest:
    req = db.get(EmployeeJoinRequest, request_id)
    if req is None or not can_access(actor, req.factory_id) or req.status == JoinRequestStatus.AWAITING_CONTACT:
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("So'rov topilmadi"))
    return req


def _claim(db: Session, req: EmployeeJoinRequest, new_status: JoinRequestStatus) -> None:
    """Shartli UPDATE: sayt va botdan bir vaqtda bosilsa ham so'rov faqat bir marta ko'rib chiqiladi."""
    claimed = db.execute(
        update(EmployeeJoinRequest)
        .where(EmployeeJoinRequest.id == req.id, EmployeeJoinRequest.status == JoinRequestStatus.NEW)
        .values(status=new_status, decided_at=_now())
        .execution_options(synchronize_session=False)
    ).rowcount
    if not claimed:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, t("Bu so'rov allaqachon ko'rib chiqilgan"))


def approve(db: Session, actor: User, request_id: int, data: JoinApprove) -> EmployeeOut:
    req = _get(db, actor, request_id)
    chat_id, lang = req.telegram_chat_id, req.telegram_lang or "uz"
    _claim(db, req, JoinRequestStatus.APPROVED)
    extra = data.model_dump(exclude_unset=True, exclude={"department"})
    try:
        created = workforce_service.create_employee(db, actor, EmployeeCreate(
            full_name=req.full_name, phone=req.phone, department=data.department, factory_id=req.factory_id, **extra,
        ))
    except HTTPException:
        db.rollback()
        raise
    employee = db.get(Employee, created.id)
    for other in db.scalars(select(Employee).where(Employee.telegram_chat_id == chat_id, Employee.id != employee.id)):
        other.telegram_chat_id = None
    employee.telegram_chat_id, employee.telegram_lang = chat_id, lang
    db.execute(update(EmployeeJoinRequest).where(EmployeeJoinRequest.id == request_id).values(employee_id=employee.id))
    db.commit()
    telegram_service.welcome_employee(db, employee, lang)
    return workforce_service.get_employee(db, actor, employee.id)


def reject(db: Session, actor: User, request_id: int) -> None:
    req = _get(db, actor, request_id)
    chat_id, lang, factory_name = req.telegram_chat_id, req.telegram_lang or "uz", req.factory.name
    _claim(db, req, JoinRequestStatus.REJECTED)
    db.commit()
    telegram_service.send_to_chat(chat_id, lang, "Afsuski, {factory} ishga qo'shilish so'rovingizni rad etdi.", factory=factory_name)


# --- Bot tomoni --------------------------------------------------------------------------------------


def _contact_keyboard(lang: str) -> dict:
    return {
        "keyboard": [[{"text": t_lang(lang, "📱 Raqamni yuborish"), "request_contact": True}]],
        "resize_keyboard": True,
        "one_time_keyboard": True,
    }


def bot_start(db: Session, chat_id: int | str, arg: str, lang: str) -> None:
    """/start j<factory_id>-<imzo>"""
    chat_id = str(chat_id)
    try:
        factory_id = int(arg[1:].split("-", 1)[0])
    except ValueError:
        factory_id = 0
    factory = db.get(Factory, factory_id) if factory_id else None
    if factory is None or not factory.is_active or not hmac.compare_digest(telegram_service.join_link_code(factory_id), arg):
        telegram_service.send_to_chat(chat_id, lang, "Havola noto'g'ri yoki eskirgan. Rahbaringizdan yangi havola so'rang.")
        return
    employee = db.scalar(select(Employee).where(
        Employee.factory_id == factory.id, Employee.telegram_chat_id == chat_id, Employee.status != EmployeeStatus.TERMINATED,
    ).limit(1))
    if employee is not None:
        telegram_service.send_to_chat(chat_id, lang, "Siz allaqachon {factory} xodimi sifatida ulangansiz. Natijangiz: /me", factory=factory.name)
        return
    pending = db.scalar(select(EmployeeJoinRequest.id).where(
        EmployeeJoinRequest.factory_id == factory.id, EmployeeJoinRequest.telegram_chat_id == chat_id,
        EmployeeJoinRequest.status == JoinRequestStatus.NEW,
    ).limit(1))
    if pending is not None:
        telegram_service.send_to_chat(chat_id, lang, "So'rovingiz rahbarga yuborilgan — javobni shu yerda kuting.")
        return
    waiting = db.scalar(select(func.count(EmployeeJoinRequest.id)).where(
        EmployeeJoinRequest.factory_id == factory.id, EmployeeJoinRequest.status == JoinRequestStatus.NEW)) or 0
    if waiting >= MAX_PENDING:
        telegram_service.send_to_chat(chat_id, lang, "Hozir ko'rib chiqilmagan so'rovlar juda ko'p. Keyinroq urinib ko'ring.")
        return
    db.execute(delete(EmployeeJoinRequest).where(
        EmployeeJoinRequest.telegram_chat_id == chat_id, EmployeeJoinRequest.status == JoinRequestStatus.AWAITING_CONTACT))
    db.add(EmployeeJoinRequest(factory_id=factory.id, telegram_chat_id=chat_id, telegram_lang=lang))
    db.commit()
    telegram_service.send_to_chat(
        chat_id, lang,
        "👋 <b>{factory}</b> — ishga qo'shilish.\n\nPastdagi «📱 Raqamni yuborish» tugmasini bosing: ismingiz va telefoningiz rahbarga yuboriladi. Tasdiqlangach, shu botda natijangiz va ish haqingizni ko'rasiz.",
        reply_markup=_contact_keyboard(lang), factory=factory.name,
    )


def _name(contact: dict) -> str:
    name = " ".join(p for p in (contact.get("first_name"), contact.get("last_name")) if p).strip()[:200]
    return name if len(name) >= 2 else f"Xodim {''.join(ch for ch in contact.get('phone_number', '') if ch.isdigit())[-4:]}".strip()


def _phone(value: str) -> str:
    value = value.strip()
    return value if value.startswith("+") else f"+{value}"


def _decision_keyboard(request_id: int, lang: str) -> dict:
    buttons = [{"text": t_lang(lang, DEPARTMENT_NAMES[d]), "callback_data": f"j:a:{request_id}:{d.value}"} for d in BOT_DEPARTMENTS]
    rows = [buttons[i:i + 2] for i in range(0, len(buttons), 2)]
    rows.append([{"text": t_lang(lang, "❌ Rad etish"), "callback_data": f"j:x:{request_id}"}])
    return {"inline_keyboard": rows}


def bot_contact(db: Session, msg: dict, lang: str) -> bool:
    """Kontakt xabari. So'rov kutilmayotgan bo'lsa False — bot odatdagi javobini beradi."""
    chat_id = str(msg["chat"]["id"])
    req = db.scalar(
        select(EmployeeJoinRequest)
        .where(EmployeeJoinRequest.telegram_chat_id == chat_id, EmployeeJoinRequest.status == JoinRequestStatus.AWAITING_CONTACT)
        .order_by(EmployeeJoinRequest.id.desc()).limit(1)
    )
    if req is None:
        return False
    contact = msg.get("contact") or {}
    if contact.get("user_id") != (msg.get("from") or {}).get("id") or not contact.get("phone_number"):
        telegram_service.send_to_chat(chat_id, lang, "Iltimos, o'zingizning raqamingizni «📱 Raqamni yuborish» tugmasi orqali yuboring.",
                                      reply_markup=_contact_keyboard(lang))
        return True
    req.full_name, req.phone = _name(contact), _phone(contact["phone_number"])[:50]
    req.status, req.telegram_lang = JoinRequestStatus.NEW, lang
    db.commit()
    factory = req.factory
    telegram_service.send_to_chat(chat_id, lang, "✅ So'rovingiz {factory} rahbariga yuborildi. Tasdiqlangach shu yerga xabar keladi.",
                                  reply_markup={"remove_keyboard": True}, factory=factory.name)
    if factory.telegram_chat_id and settings.telegram_enabled:
        flang = factory.telegram_lang or "uz"
        telegram_service.send_to_chat(
            factory.telegram_chat_id, flang,
            "🙋 <b>Yangi xodim so'rovi</b>\n{name}, {phone}\n\nQaysi bo'limga qabul qilinsin?",
            reply_markup=_decision_keyboard(req.id, flang), name=req.full_name, phone=req.phone,
        )
    return True


def bot_decision(db: Session, cq: dict) -> None:
    """Zavod chatidagi "j:a:<id>:<bo'lim>" / "j:x:<id>" tugmalari."""
    parts = (cq.get("data") or "").split(":")
    if len(parts) not in (3, 4) or not parts[2].isdigit():
        telegram_service.answer_callback(cq)
        return
    action, request_id = parts[1], int(parts[2])
    chat_id = str(((cq.get("message") or {}).get("chat") or {}).get("id", ""))
    req = db.get(EmployeeJoinRequest, request_id)
    factory = req.factory if req else None
    if factory is None or not factory.telegram_chat_id or factory.telegram_chat_id != chat_id:
        telegram_service.answer_callback(cq, t_lang("uz", "Ruxsat yo'q"), alert=True)
        return
    lang = factory.telegram_lang or "uz"
    actor = telegram_service.factory_actor(db, factory.id)
    if actor is None:
        telegram_service.answer_callback(cq, t_lang(lang, "Amalni bajarib bo'lmadi"), alert=True)
        return
    try:
        if action == "a" and len(parts) == 4 and parts[3] in Department.__members__:
            department = Department(parts[3])
            approve(db, actor, request_id, JoinApprove(department=department))
            label = t_lang(lang, "✅ Qabul qilindi: {department}", department=t_lang(lang, DEPARTMENT_NAMES[department]))
        elif action == "x":
            reject(db, actor, request_id)
            label = t_lang(lang, "❌ Rad etildi")
        else:
            telegram_service.answer_callback(cq)
            return
    except HTTPException as exc:
        db.rollback()
        telegram_service.answer_callback(cq, t_lang(lang, str(exc.detail)), alert=True)
        return
    telegram_service.edit_callback_markup(cq, {"inline_keyboard": [[{"text": label, "callback_data": "o:done"}]]})
    telegram_service.answer_callback(cq, label)
