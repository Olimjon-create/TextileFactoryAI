"""Audit log: muhim amallar tarixi (kim, qachon, nimani o'zgartirdi)."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.schemas.audit import AuditLogPage
from app.services import audit_service

router = APIRouter(prefix="/audit-logs", tags=["Audit log"])
can_view = require_roles(*audit_service.AUDIT_VIEW_ROLES)


@router.get("", response_model=AuditLogPage)
def list_logs(
    entity: str | None = Query(default=None, max_length=50),
    entity_id: int | None = None,
    action: str | None = Query(default=None, max_length=20),
    user_id: int | None = None,
    search: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return audit_service.list_logs(
        db, actor, entity=entity, entity_id=entity_id, action=action, user_id=user_id, search=search,
        date_from=date_from, date_to=date_to, factory_id=factory_id, offset=offset, limit=limit,
    )
