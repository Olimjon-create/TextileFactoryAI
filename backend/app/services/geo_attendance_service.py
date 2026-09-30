"""Telegram bot orqali davomat: xodim "📍 Joylashuvni yuborish" tugmasini bosadi, zavoddan radius ichida bo'lsa
kelgani (yoki ochiq kun bo'lsa — ketgani) belgilanadi.

Soxtalashtirishga qarshi: joylashuv faqat request_location tugmasidan qabul qilinadi (forward qilingan xabar rad
etiladi), xabar 2 daqiqadan eski bo'lmasligi kerak, masofa zavod nuqtasidan hisoblanadi. Belgilash mavjud
attendance_service.check_in / check_out orqali — kechikish va ishlangan vaqt hisobi bir joyda qoladi.
"""

import math
import time
from datetime import timedelta
from decimal import Decimal

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.i18n import t_lang
from app.core.scope import resolve_factory_id
from app.models import FactorySettings, User
from app.models.analytics import SETTINGS_DEFAULTS
from app.models.attendance import AttendanceStatus
from app.models.audit import AuditAction
from app.models.resources import EmployeeStatus
from app.schemas.attendance import CheckIn, CheckOut
from app.services import audit_service, telegram_service

MAX_AGE_SECONDS = 120
DEFAULT_RADIUS = 200


class GeoSettings(BaseModel):
    enabled: bool = False
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)
    radius_m: int = Field(default=DEFAULT_RADIUS, ge=30, le=5000)

    @model_validator(mode="after")
    def _point(self):
        if self.enabled and (self.lat is None or self.lng is None):
            raise ValueError("Davomatni yoqish uchun zavod joylashuvini kiriting")
        return self


def _row(db: Session, factory_id: int) -> FactorySettings | None:
    return db.scalar(select(FactorySettings).where(FactorySettings.factory_id == factory_id))


def _out(row: FactorySettings | None) -> GeoSettings:
    if row is None:
        return GeoSettings()
    return GeoSettings(
        enabled=bool(row.geo_enabled), lat=float(row.geo_lat) if row.geo_lat is not None else None,
        lng=float(row.geo_lng) if row.geo_lng is not None else None, radius_m=row.geo_radius_m or DEFAULT_RADIUS,
    )


def get_settings(db: Session, actor: User, factory_id: int | None) -> GeoSettings:
    return _out(_row(db, resolve_factory_id(db, actor, factory_id)))


def update_settings(db: Session, actor: User, data: GeoSettings, factory_id: int | None) -> GeoSettings:
    fid = resolve_factory_id(db, actor, factory_id)
    row = _row(db, fid)
    if row is None:
        row = FactorySettings(factory_id=fid, **SETTINGS_DEFAULTS)
        db.add(row)
    row.geo_enabled = data.enabled
    row.geo_lat = Decimal(str(round(data.lat, 6))) if data.lat is not None else None
    row.geo_lng = Decimal(str(round(data.lng, 6))) if data.lng is not None else None
    row.geo_radius_m = data.radius_m
    db.flush()
    audit_service.record(db, actor, entity="factory_settings", entity_id=row.id, action=AuditAction.UPDATE, factory_id=fid,
                         summary="Botdan davomat: " + (f"yoqildi, radius {data.radius_m} m" if data.enabled else "o'chirildi"))
    db.commit()
    return _out(row)


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Ikki nuqta orasidagi masofa (haversine), metrda."""
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# --- Bot ---------------------------------------------------------------------------------------------


def location_keyboard(lang: str) -> dict:
    return {
        "keyboard": [[{"text": t_lang(lang, "📍 Joylashuvni yuborish"), "request_location": True}]],
        "resize_keyboard": True,
        "is_persistent": True,
    }


def _employee(db: Session, chat_id):
    employee = telegram_service.employee_by_chat(db, chat_id)
    if employee is None or employee.status not in (EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE):
        return None
    return employee


def prompt(db: Session, chat_id, lang: str) -> None:
    """"📍 Keldim / Ketdim" tugmasi: joylashuv so'raydigan klaviatura."""
    employee = _employee(db, chat_id)
    if employee is None:
        telegram_service.send_to_chat(chat_id, lang, "Siz xodim sifatida ulanmagansiz. Rahbaringizdan shaxsiy havolani so'rang.")
        return
    if not _out(_row(db, employee.factory_id)).enabled:
        telegram_service.send_to_chat(chat_id, lang, "Zavodingizda bot orqali davomat yoqilmagan.")
        return
    telegram_service.send_to_chat(chat_id, lang,
                                  "📍 Zavod hududida turib pastdagi «📍 Joylashuvni yuborish» tugmasini bosing — kelgan yoki ketgan vaqtingiz belgilanadi.",
                                  reply_markup=location_keyboard(lang))


def _hm(minutes: int | None) -> str:
    minutes = minutes or 0
    return f"{minutes // 60}:{minutes % 60:02d}"


def handle_location(db: Session, msg: dict, lang: str) -> bool:
    """Joylashuv xabari. Xodim bo'lmasa False — bot odatdagi javobini beradi."""
    chat_id = msg["chat"]["id"]
    employee = _employee(db, chat_id)
    if employee is None:
        return False
    if msg.get("forward_origin") or msg.get("forward_date") or msg.get("via_bot"):
        telegram_service.send_to_chat(chat_id, lang, "Joylashuvni faqat «📍 Joylashuvni yuborish» tugmasi orqali yuboring.",
                                      reply_markup=location_keyboard(lang))
        return True
    if msg.get("date") and time.time() - msg["date"] > MAX_AGE_SECONDS:
        telegram_service.send_to_chat(chat_id, lang, "Joylashuv eskirgan — tugmani qayta bosing.", reply_markup=location_keyboard(lang))
        return True
    geo = _out(_row(db, employee.factory_id))
    if not geo.enabled:
        telegram_service.send_to_chat(chat_id, lang, "Zavodingizda bot orqali davomat yoqilmagan.")
        return True
    loc = msg.get("location") or {}
    try:
        dist = distance_m(float(loc["latitude"]), float(loc["longitude"]), geo.lat, geo.lng)
    except (KeyError, TypeError, ValueError):
        return True
    if dist > geo.radius_m:
        telegram_service.send_to_chat(chat_id, lang, "❌ Siz zavoddan {dist} m uzoqdasiz (ruxsat: {radius} m). Zavod hududiga kirib qayta yuboring.",
                                      reply_markup=location_keyboard(lang), dist=round(dist), radius=geo.radius_m)
        return True

    from app.services import attendance_service

    actor = telegram_service.factory_actor(db, employee.factory_id)
    if actor is None:
        telegram_service.send_to_chat(chat_id, lang, "Amalni bajarib bo'lmadi")
        return True
    today = attendance_service.local_now().date()
    rec = attendance_service._record(db, employee.id, today)
    prev = attendance_service._record(db, employee.id, today - timedelta(days=1))
    present = rec is not None and rec.status == AttendanceStatus.PRESENT and rec.check_in is not None
    if present and rec.check_out is not None:
        telegram_service.send_to_chat(chat_id, lang, "Bugun kelgan ({check_in}) va ketgan ({check_out}) vaqtingiz allaqachon belgilangan.",
                                      check_in=rec.check_in.strftime("%H:%M"), check_out=rec.check_out.strftime("%H:%M"))
        return True
    night_open = rec is None and prev is not None and prev.check_in is not None and prev.check_out is None
    try:
        if present or night_open:
            out = attendance_service.check_out(db, actor, CheckOut(employee_id=employee.id))
            telegram_service.send_to_chat(chat_id, lang, "🏁 Ketdingiz: {time}. Ishlangan vaqt: {worked} soat.",
                                          reply_markup=location_keyboard(lang), time=out.check_out.strftime("%H:%M"), worked=_hm(out.worked_minutes))
        else:
            out = attendance_service.check_in(db, actor, CheckIn(employee_id=employee.id, note=f"Telegram, joylashuv {round(dist)} m"))
            template = "✅ Keldingiz: {time}. Kechikish: {late} daq." if out.late_minutes else "✅ Keldingiz: {time}. Xayrli ish kuni!"
            telegram_service.send_to_chat(chat_id, lang, template, reply_markup=location_keyboard(lang),
                                          time=out.check_in.strftime("%H:%M"), late=out.late_minutes)
    except HTTPException as exc:
        db.rollback()
        telegram_service.send_to_chat(chat_id, lang, str(exc.detail))
    return True
