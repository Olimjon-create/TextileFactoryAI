"""Tahlil: fabrika sozlamalari, buyurtma tannarxi, hisobotlar, bildirishnomalar."""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import User
from app.schemas.analytics import (
    MarkRead,
    NotificationList,
    OrderCosting,
    ReportInfo,
    ReportKind,
    ReportTable,
    SettingsOut,
    SettingsUpdate,
)
from app.services import costing_service, notification_service, report_service

router = APIRouter(tags=["Analytics"])
finance = require_roles(*costing_service.FINANCE_ROLES)
settings_editor = require_roles(*costing_service.SETTINGS_EDITOR_ROLES)


@router.get("/settings/factory", response_model=SettingsOut)
def get_settings(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(finance)):
    return costing_service.get_settings(db, actor, factory_id)


@router.put("/settings/factory", response_model=SettingsOut)
def update_settings(data: SettingsUpdate, factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(settings_editor)):
    return costing_service.update_settings(db, actor, data, factory_id)


@router.get("/orders/{order_id}/costing", response_model=OrderCosting)
def order_costing(order_id: int, db: Session = Depends(get_db), actor: User = Depends(finance)):
    return costing_service.order_costing(db, actor, order_id)


@router.get("/reports", response_model=list[ReportInfo])
def reports(actor: User = Depends(get_current_user)):
    return report_service.available(actor)


@router.get("/reports/{kind}", response_model=ReportTable)
def report(kind: ReportKind, date_from: date | None = None, date_to: date | None = None, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    return report_service.build(db, actor, kind, date_from, date_to)


@router.get("/notifications", response_model=NotificationList)
def notifications(db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    return notification_service.list_for(db, actor)


@router.post("/notifications/read", response_model=NotificationList)
def mark_read(data: MarkRead, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    return notification_service.mark_read(db, actor, data.keys)


@router.post("/notifications/read-all", response_model=NotificationList)
def mark_all_read(db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    return notification_service.mark_read(db, actor)
