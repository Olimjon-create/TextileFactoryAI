"""Xodimlarni Telegram bot orqali qo'shish: zavod havolasi va kelgan so'rovlar."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.schemas.join_request import JoinApprove, JoinLinkOut, JoinRequestOut
from app.schemas.resources import EmployeeOut
from app.services import join_request_service
from app.services.workforce_service import WORKFORCE_EDITOR_ROLES

router = APIRouter(prefix="/employee-join", tags=["Employees"])
can_manage = require_roles(*WORKFORCE_EDITOR_ROLES)


@router.get("/link", response_model=JoinLinkOut)
def join_link(factory_id: int | None = Query(default=None), db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    return join_request_service.link_status(db, actor, factory_id)


@router.get("/requests", response_model=list[JoinRequestOut])
def list_requests(factory_id: int | None = Query(default=None), db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    return join_request_service.list_pending(db, actor, factory_id)


@router.post("/requests/{request_id}/approve", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def approve(request_id: int, data: JoinApprove, db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    return join_request_service.approve(db, actor, request_id, data)


@router.post("/requests/{request_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject(request_id: int, db: Session = Depends(get_db), actor: User = Depends(can_manage)):
    join_request_service.reject(db, actor, request_id)
