"""Audit log: muhim amallarni yozish va ko'rish.

record() yozuvni sessiyaga qo'shadi, commit esa asosiy amal bilan birga bo'ladi —
amal bekor bo'lsa (xato), audit yozuvi ham saqlanmaydi.
"""

import enum
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.core.scope import scoped
from app.models import AuditLog, User
from app.schemas.audit import AuditLogOut, AuditLogPage

AUDIT_VIEW_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER)


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def diff(obj: Any, values: dict[str, Any]) -> dict[str, list[Any]]:
    """O'zgargan maydonlar: {"maydon": [eski, yangi]} (setattr dan OLDIN chaqiring)."""
    changes = {}
    for field, new in values.items():
        old = getattr(obj, field, None)
        if _jsonable(old) != _jsonable(new):
            changes[field] = [_jsonable(old), _jsonable(new)]
    return changes


def record(
    db: Session,
    actor: User,
    *,
    entity: str,
    entity_id: int | None,
    action: str,
    summary: str,
    factory_id: int | None,
    changes: dict[str, Any] | None = None,
) -> None:
    db.add(
        AuditLog(
            factory_id=factory_id,
            user_id=actor.id,
            user_name=actor.full_name,
            entity=entity,
            entity_id=entity_id,
            action=action,
            summary=summary[:300],
            changes={k: _jsonable(v) if not isinstance(v, list) else [_jsonable(x) for x in v] for k, v in changes.items()}
            if changes
            else None,
        )
    )


def record_login(db: Session, user: User, *, method: str, ip: str, user_agent: str | None) -> None:
    """Muvaffaqiyatli kirish: kim, qachon (created_at), qaysi IP va qurilmadan."""
    record(
        db,
        user,
        entity="session",
        entity_id=user.id,
        action="LOGIN",
        summary=f"{user.full_name} tizimga kirdi ({method})",
        factory_id=user.factory_id,
        changes={"email": user.email, "ip": ip, "qurilma": (user_agent or "—")[:200]},
    )
    db.commit()


def list_logs(
    db: Session,
    actor: User,
    *,
    entity: str | None = None,
    entity_id: int | None = None,
    action: str | None = None,
    user_id: int | None = None,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> AuditLogPage:
    query = scoped(select(AuditLog), actor, AuditLog.factory_id, factory_id)
    if entity:
        query = query.where(AuditLog.entity == entity)
    if entity_id is not None:
        query = query.where(AuditLog.entity_id == entity_id)
    if action:
        query = query.where(AuditLog.action == action)
    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(AuditLog.summary.ilike(pattern), AuditLog.user_name.ilike(pattern)))
    if date_from:
        query = query.where(AuditLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.where(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).offset(offset).limit(limit))
    return AuditLogPage(items=[AuditLogOut.model_validate(r) for r in rows], total=total)
