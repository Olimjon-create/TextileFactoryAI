import secrets

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.roles import Role
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Factory, User
from app.schemas.auth import RegisterRequest, TokenResponse
from app.schemas.user import UserOut
from app.services.google_auth import GoogleIdentity


def build_token_response(user: User) -> TokenResponse:
    token = create_access_token(user.id, {"role": user.role.value})
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


def _ensure_can_login(user: User) -> None:
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Foydalanuvchi bloklangan")
    if user.factory is not None and not user.factory.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Fabrika faol emas")


def change_password(user: User, current_password: str, new_password: str) -> None:
    """Foydalanuvchi o'z parolini almashtiradi (joriy parolni bilishi shart)."""
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Joriy parol noto'g'ri")
    if current_password == new_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Yangi parol joriy paroldan farq qilishi kerak")
    user.hashed_password = hash_password(new_password)


def authenticate(db: Session, email: str, password: str) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None or not verify_password(password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email yoki parol noto'g'ri")
    _ensure_can_login(user)
    return user


def login_with_google(db: Session, identity: GoogleIdentity) -> User:
    """Google orqali kirish.

    - Email tizimda bor bo'lsa (masalan, admin qo'shgan xodim) — shu foydalanuvchi sifatida kiradi.
    - Yo'q bo'lsa — /register kabi avtomatik yangi fabrika va uning egasi (FACTORY_OWNER) yaratiladi.
    """
    user = db.scalar(select(User).where(User.email == identity.email))
    if user is not None:
        _ensure_can_login(user)
        return user
    if not settings.SELF_REGISTRATION_ENABLED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu Google hisobi tizimda yo'q. Login va parolni administrator beradi")

    factory = Factory(name=f"{identity.full_name} fabrikasi")
    user = User(
        email=identity.email,
        full_name=identity.full_name,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        role=Role.FACTORY_OWNER,
        factory=factory,
    )
    db.add_all([factory, user])
    db.commit()
    db.refresh(user)
    return user


def register_owner(db: Session, data: RegisterRequest) -> User:
    if not settings.SELF_REGISTRATION_ENABLED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ro'yxatdan o'tish yopiq. Login va parolni administrator beradi")
    email = data.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu email allaqachon ro'yxatdan o'tgan")

    factory = Factory(name=data.factory_name, address=data.factory_address, phone=data.phone)
    user = User(
        email=email,
        full_name=data.full_name,
        phone=data.phone,
        hashed_password=hash_password(data.password),
        role=Role.FACTORY_OWNER,
        factory=factory,
    )
    db.add_all([factory, user])
    db.commit()
    db.refresh(user)
    return user
