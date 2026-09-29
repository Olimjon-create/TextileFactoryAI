from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.core.config import settings


WEAK_PARTS = ("admin", "password", "parol", "qwerty", "12345", "11111", "00000", "textile")


def is_weak_password(password: str, email: str | None = None) -> bool:
    low = password.lower()
    if len(password) < 10 or len(set(password)) < 5 or any(part in low for part in WEAK_PARTS):
        return True
    local = (email or "").split("@")[0].lower()
    return len(local) >= 4 and local in low


def set_password(user, password: str) -> None:
    user.hashed_password = hash_password(password)
    user.password_weak = is_weak_password(password, user.email)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(subject: str | int, extra: dict | None = None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(subject), "exp": expire, **(extra or {})}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
