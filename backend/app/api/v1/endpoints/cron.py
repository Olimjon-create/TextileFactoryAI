"""Rejali vazifalar (Vercel Cron). Faqat CRON_SECRET bilan chaqiriladi."""

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.services import daily_service

router = APIRouter(prefix="/cron", tags=["System"], include_in_schema=False)


def _authorized(authorization: str | None = Header(default=None)) -> None:
    secret = settings.CRON_SECRET.strip()
    if not secret or not hmac.compare_digest(authorization or "", f"Bearer {secret}"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")


@router.get("/daily", dependencies=[Depends(_authorized)])
def daily(db: Session = Depends(get_db)):
    return daily_service.run(db)
