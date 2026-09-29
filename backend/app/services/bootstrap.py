from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.roles import Role
from app.core.security import hash_password
from app.models import User


def ensure_superadmin() -> bool:
    """Tizimda SUPER_ADMIN bo'lmasa .env dagi SUPERADMIN_* qiymatlari bilan yaratadi.

    Yangi admin yaratilsa True qaytaradi.
    """
    with SessionLocal() as db:
        if db.scalar(select(User.id).where(User.role == Role.SUPER_ADMIN).limit(1)):
            return False
        email = settings.SUPERADMIN_EMAIL.lower()
        if db.scalar(select(User.id).where(User.email == email)):
            return False
        db.add(
            User(
                email=email,
                full_name=settings.SUPERADMIN_FULL_NAME,
                hashed_password=hash_password(settings.SUPERADMIN_PASSWORD),
                role=Role.SUPER_ADMIN,
            )
        )
        db.commit()
        return True
