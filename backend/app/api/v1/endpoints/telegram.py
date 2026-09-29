import hmac

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_roles
from app.core.i18n import t
from app.core.roles import Role
from app.models import Factory, User
from app.services import telegram_service

router = APIRouter(prefix="/telegram", tags=["Telegram"])
can_manage = require_roles(Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER)


class TelegramStatus(BaseModel):
    enabled: bool
    bot_username: str | None
    linked: bool
    link_url: str | None
    shop_url: str | None = None  # mijozlarga tarqatiladigan do'kon havolasi


def _factory(db: Session, actor: User, factory_id: int | None) -> Factory:
    fid = factory_id if actor.role == Role.SUPER_ADMIN else actor.factory_id
    factory = db.get(Factory, fid) if fid else None
    if factory is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("Fabrika topilmadi"))
    return factory


@router.get("/status", response_model=TelegramStatus)
def telegram_status(factory_id: int | None = Query(default=None), db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    return telegram_service.status_for(_factory(db, actor, factory_id))


@router.post("/check", response_model=TelegramStatus)
def telegram_check(factory_id: int | None = Query(default=None), db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    return telegram_service.check_link(db, _factory(db, actor, factory_id))


@router.post("/test", status_code=status.HTTP_204_NO_CONTENT)
def telegram_test(factory_id: int | None = Query(default=None), db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    factory = _factory(db, actor, factory_id)
    if not telegram_service.send(factory, "Sinov xabari: TextileCore → {factory} ✅", factory=factory.name):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, t("Xabar yuborilmadi — Telegram ulanganini tekshiring"))


@router.delete("", response_model=TelegramStatus)
def telegram_unlink(factory_id: int | None = Query(default=None), db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    return telegram_service.unlink(db, _factory(db, actor, factory_id))


@router.post("/webhook", include_in_schema=False)
def telegram_webhook(
    request: Request,
    update: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    secret: str | None = Header(default=None, alias="X-Telegram-Bot-Api-Secret-Token"),
):
    """Telegram bot yangilanishlari. Imzo sarlavhasi mos kelmasa — rad etiladi."""
    if not settings.telegram_enabled or not hmac.compare_digest(secret or "", telegram_service.webhook_secret()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
    try:
        telegram_service.handle_update(db, update, str(request.base_url))
    except Exception as exc:  # noqa: BLE001 — 200 qaytmasa Telegram shu xabarni qayta-qayta yuboradi
        db.rollback()
        print("telegram webhook:", exc)
    return {"ok": True}


@router.post("/setup")
def telegram_setup(request: Request, actor: User = Depends(require_roles(Role.SUPER_ADMIN))):
    """Webhook va "Do'kon" menyu tugmasini o'rnatish (deploy'dan keyin bir marta)."""
    return telegram_service.setup_bot(str(request.base_url))
