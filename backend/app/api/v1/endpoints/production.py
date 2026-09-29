"""Ishlab chiqarish: ish buyurtmalari, bosqich amal yozuvlari, partiya/qutilar, kuzatuv, KPI."""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.models.production import WorkOrderStatus
from app.schemas.production import (
    EmployeeKpi,
    LogCreate,
    ProductionSummary,
    TraceResult,
    UnitCreate,
    WorkOrderCreate,
    WorkOrderDetail,
    WorkOrderPage,
    WorkOrderUpdate,
)
from app.services import production_service as svc

router = APIRouter(prefix="/production", tags=["Production (MES)"])
can_view = require_roles(*svc.PRODUCTION_VIEW_ROLES)
can_edit = require_roles(*svc.PRODUCTION_EDITOR_ROLES)
can_log = require_roles(*svc.LOG_ROLES)
can_kpi = require_roles(*svc.KPI_VIEW_ROLES)


@router.get("/summary", response_model=ProductionSummary)
def summary(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.summary(db, actor, factory_id)


@router.get("/work-orders", response_model=WorkOrderPage)
def list_work_orders(
    search: str | None = Query(default=None, max_length=100),
    status_: WorkOrderStatus | None = Query(default=None, alias="status"),
    active: bool = False,
    late: bool = False,
    line_id: int | None = None,
    order_id: int | None = None,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_work_orders(
        db, actor, search=search, status_=status_, active=active, late=late, line_id=line_id, order_id=order_id,
        factory_id=factory_id, offset=offset, limit=limit,
    )


@router.post("/work-orders", response_model=WorkOrderDetail, status_code=status.HTTP_201_CREATED)
def create_work_order(data: WorkOrderCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_work_order(db, actor, data)


@router.get("/work-orders/{wo_id}", response_model=WorkOrderDetail)
def get_work_order(wo_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.get_work_order(db, actor, wo_id)


@router.patch("/work-orders/{wo_id}", response_model=WorkOrderDetail)
def update_work_order(wo_id: int, data: WorkOrderUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_work_order(db, actor, wo_id, data)


@router.post("/work-orders/{wo_id}/complete", response_model=WorkOrderDetail)
def complete_work_order(wo_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    """Qo'lda yakunlash (qadoqlangan miqdor rejadan kam bo'lsa ham)."""
    return svc.set_work_order_status(db, actor, wo_id, WorkOrderStatus.COMPLETED)


@router.post("/work-orders/{wo_id}/cancel", response_model=WorkOrderDetail)
def cancel_work_order(wo_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.set_work_order_status(db, actor, wo_id, WorkOrderStatus.CANCELLED)


@router.post("/work-orders/{wo_id}/logs", response_model=WorkOrderDetail, status_code=status.HTTP_201_CREATED)
def add_log(wo_id: int, data: LogCreate, db: Session = Depends(get_db), actor: User = Depends(can_log)):
    """Bosqich ishini qayd etish (qo'lda, skaner yoki kamera). Oldingi bosqichdan kelgandan ko'p bo'lmaydi."""
    return svc.add_log(db, actor, wo_id, data)


@router.delete("/logs/{log_id}", response_model=WorkOrderDetail)
def delete_log(log_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.delete_log(db, actor, log_id)


@router.post("/work-orders/{wo_id}/units", response_model=WorkOrderDetail, status_code=status.HTTP_201_CREATED)
def create_unit(wo_id: int, data: UnitCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    """Partiya (kesilgandan) yoki quti (sifatdan o'tgandan) — QR/shtrix-kod bilan kuzatish uchun."""
    return svc.create_unit(db, actor, wo_id, data)


@router.get("/trace", response_model=TraceResult)
def trace(code: str = Query(min_length=1, max_length=60), db: Session = Depends(get_db), actor: User = Depends(can_view)):
    """Skanerlangan kod: partiya, quti, ish buyurtmasi, buyurtma, material yoki mashina."""
    return svc.trace(db, actor, code)


@router.get("/kpi/employees", response_model=list[EmployeeKpi])
def employee_kpi(
    date_from: date | None = None,
    date_to: date | None = None,
    line_id: int | None = None,
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(can_kpi),
):
    today = date.today()
    return svc.employee_kpi(db, actor, date_from=date_from or today - timedelta(days=6), date_to=date_to or today, line_id=line_id, factory_id=factory_id)
