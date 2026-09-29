"""Parolni email orqali tiklash.

Xavfsizlik: tokenning faqat SHA-256 xeshi saqlanadi; 1 soat amal qiladi va bir martalik;
javob email tizimda bor-yo'qligini oshkor qilmaydi; yangi so'rov eski havolalarni bekor qiladi.
"""

import hashlib
import html
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.i18n import t
from app.core.security import set_password
from app.models import PasswordResetToken, User
from app.services import audit_service, mail_service

TOKEN_TTL = timedelta(hours=1)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(d: datetime) -> datetime:
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def request_reset(db: Session, email: str, base_url: str) -> None:
    """Xat yuboradi (foydalanuvchi bo'lsa). Hech qachon "topilmadi" demaydi."""
    if not mail_service.enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, t("Parolni tiklash sozlanmagan — administratorga murojaat qiling"))
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not user.is_active:
        return
    db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
               .values(used_at=_now()))
    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(user_id=user.id, token_hash=_hash(token), expires_at=_now() + TOKEN_TTL))
    db.commit()
    link = f"{(settings.APP_URL.strip() or base_url).rstrip('/')}/reset-password?token={token}"
    greeting = html.escape(t("Salom, {name}!", name=user.full_name))
    intro = html.escape(t("TextileCore hisobingiz parolini tiklash so'raldi. Yangi parol o'rnatish uchun havolani bosing (1 soat amal qiladi):"))
    button = html.escape(t("Yangi parol o'rnatish"))
    ignore = html.escape(t("Agar buni siz so'ramagan bo'lsangiz, xatga e'tibor bermang — parolingiz o'zgarmaydi."))
    body = f'<p>{greeting}</p><p>{intro}</p><p><a href="{link}">{button}</a></p><p style="color:#888">{ignore}</p>'
    try:
        mail_service.send(user.email, t("TextileCore: parolni tiklash"), body)
    except Exception as exc:
        print(exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, t("Xatni yuborib bo'lmadi, keyinroq urinib ko'ring"))


def reset_password(db: Session, token: str, new_password: str) -> None:
    row = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == _hash(token)))
    if row is None or row.used_at is not None or _aware(row.expires_at) < _now():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, t("Havola yaroqsiz yoki muddati o'tgan — qaytadan so'rang"))
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, t("Havola yaroqsiz yoki muddati o'tgan — qaytadan so'rang"))
    set_password(user, new_password)
    row.used_at = _now()
    audit_service.record(
        db, user, entity="session", entity_id=user.id, action="PASSWORD",
        summary=f"{user.full_name} parolini email orqali tikladi", factory_id=user.factory_id,
    )
    db.commit()
