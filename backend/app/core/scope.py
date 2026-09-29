"""Fabrika bo'yicha ma'lumotlarni ajratish (factory-based data isolation) — yangi modullar uchun umumiy.

SUPER_ADMIN barcha fabrikalarni ko'radi (ixtiyoriy factory_id filtri bilan);
boshqa rollar faqat o'z fabrikasi ma'lumotlarini ko'radi va o'zgartiradi.
"""

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.models import Factory, User


def scoped(query, actor: User, factory_column, factory_id: int | None = None):
    """Ro'yxat so'rovini foydalanuvchi ko'rishi mumkin bo'lgan fabrika(lar)ga cheklaydi."""
    if actor.role != Role.SUPER_ADMIN:
        return query.where(factory_column == actor.factory_id)
    if factory_id is not None:
        return query.where(factory_column == factory_id)
    return query


def can_access(actor: User, factory_id: int) -> bool:
    return actor.role == Role.SUPER_ADMIN or actor.factory_id == factory_id


def resolve_factory_id(db: Session, actor: User, factory_id: int | None) -> int:
    """Yangi yozuv qaysi fabrikaga tegishli: oddiy foydalanuvchi — o'zining, SUPER_ADMIN — tanlagani."""
    if actor.role != Role.SUPER_ADMIN:
        if actor.factory_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Foydalanuvchi fabrikaga biriktirilmagan")
        return actor.factory_id
    if factory_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fabrikani tanlang")
    if db.get(Factory, factory_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fabrika topilmadi")
    return factory_id
