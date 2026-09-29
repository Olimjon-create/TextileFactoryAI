from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import User
from app.schemas.auth import (
    AuthConfig,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.schemas.user import UserOut
from app.services import audit_service, auth_service, google_auth, password_reset_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/config", response_model=AuthConfig)
def auth_config():
    """Frontend uchun ochiq sozlamalar (Google Client ID maxfiy emas)."""
    return AuthConfig(
        google_client_id=settings.GOOGLE_CLIENT_ID or None,
        registration_enabled=settings.SELF_REGISTRATION_ENABLED,
        password_reset_enabled=settings.mail_enabled,
    )


def _site_url(request: Request) -> str:
    """Xatdagi havola manzili. Origin'ga faqat ruxsat etilgan ro'yxatda bo'lsa ishonamiz —
    aks holda begona sayt havolani o'ziga yo'naltirib tokenni o'g'irlashi mumkin."""
    origin = request.headers.get("origin", "")
    if origin and origin in settings.cors_origins_list:
        return origin
    return str(request.base_url)


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit.by_ip("forgot", 5, 900))])
def forgot_password(data: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit.hit(f"forgot-email:{data.email.lower()}", 3, 3600)
    password_reset_service.request_reset(db, data.email, _site_url(request))


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit.by_ip("reset", 10, 900))])
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    password_reset_service.reset_password(db, data.token, data.new_password)


def _log_login(db: Session, user: User, request: Request, method: str) -> None:
    audit_service.record_login(
        db, user, method=method, ip=rate_limit.client_ip(request), user_agent=request.headers.get("user-agent")
    )


@router.post("/login", response_model=TokenResponse, dependencies=[Depends(rate_limit.by_ip("login", 30, 300))])
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit.hit(f"login-email:{data.email.lower()}", 10, 900)
    user = auth_service.authenticate(db, data.email, data.password)
    _log_login(db, user, request, "parol")
    return auth_service.build_token_response(user)


@router.post("/google", response_model=TokenResponse, dependencies=[Depends(rate_limit.by_ip("google", 30, 300))])
def login_google(data: GoogleLoginRequest, request: Request, db: Session = Depends(get_db)):
    identity = google_auth.verify_google_credential(data.credential)
    user = auth_service.login_with_google(db, identity)
    _log_login(db, user, request, "Google")
    return auth_service.build_token_response(user)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit.by_ip("register", 10, 3600))])
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    user = auth_service.register_owner(db, data)
    return auth_service.build_token_response(user)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit.by_ip("change-password", 10, 900))])
def change_password(data: ChangePasswordRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    auth_service.change_password(current_user, data.current_password, data.new_password)
    audit_service.record(
        db, current_user, entity="session", entity_id=current_user.id, action="PASSWORD",
        summary=f"{current_user.full_name} parolini o'zgartirdi", factory_id=current_user.factory_id,
    )
    db.commit()
