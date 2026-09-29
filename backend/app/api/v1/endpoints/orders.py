from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.models.order import OrderSource, OrderStatus
from app.schemas.material_plan import IssueRequest, OrderMaterials
from app.schemas.production import WorkOrderOut, WorkOrdersFromOrder
from app.schemas.order import ManualOrderCreate, OrderOut, OrderPage, OrderStatusUpdate, OrderSummary, OrderUpdate
from app.services import material_plan_service, order_service, production_service
from app.services.order_service import ORDER_EDITOR_ROLES, ORDER_VIEW_ROLES

router = APIRouter(prefix="/orders", tags=["Orders"])

can_view = require_roles(*ORDER_VIEW_ROLES)
can_edit = require_roles(*ORDER_EDITOR_ROLES)
can_issue = require_roles(*material_plan_service.ISSUE_ROLES)


@router.get("", response_model=OrderPage)
def list_orders(
    search: str | None = Query(default=None, max_length=100),
    status_: OrderStatus | None = Query(default=None, alias="status"),
    source: OrderSource | None = None,
    overdue: bool = False,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return order_service.list_orders(
        db, actor, search=search, status_=status_, factory_id=factory_id, source=source, overdue=overdue,
        offset=offset, limit=limit,
    )


@router.post("", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(data: ManualOrderCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    """Menejer CRM'dagi mijoz uchun buyurtma kiritadi (B2B)."""
    return order_service.create_manual_order(db, actor, data)


@router.get("/summary", response_model=OrderSummary)
def summary(db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return order_service.summary(db, actor)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return order_service.get_order(db, actor, order_id)


@router.patch("/{order_id}", response_model=OrderOut)
def update_order(order_id: int, data: OrderUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    """Topshirish muddati, manzil va izoh."""
    return order_service.update_order(db, actor, order_id, data)


@router.patch("/{order_id}/status", response_model=OrderOut)
def update_status(
    order_id: int,
    data: OrderStatusUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(can_edit),
):
    return order_service.update_status(db, actor, order_id, data.status)


@router.post("/{order_id}/payment", response_model=OrderOut)
def record_payment(order_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    """Qo'lda kiritilgan buyurtma: to'lov (o'tkazma/naqd) qabul qilinganini qayd etish."""
    return order_service.record_manual_payment(db, actor, order_id)


@router.get("/{order_id}/materials", response_model=OrderMaterials)
def order_materials(order_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    """BOM asosida material ehtiyoji: reja, chiqarilgan, ombordagi qoldiq, yetishmovchilik, ortiqcha sarf."""
    return material_plan_service.requirements(db, actor, order_id)


@router.post("/{order_id}/materials/issue", response_model=OrderMaterials)
def issue_materials(order_id: int, data: IssueRequest, db: Session = Depends(get_db), actor: User = Depends(can_issue)):
    """Buyurtmaga material chiqarish (joy berilmasa — avtomatik) yoki qaytarish. Hammasi bitta tranzaksiyada."""
    return material_plan_service.issue(db, actor, order_id, data)


@router.post("/{order_id}/work-orders", response_model=list[WorkOrderOut], status_code=status.HTTP_201_CREATED)
def create_work_orders(order_id: int, data: WorkOrdersFromOrder, db: Session = Depends(get_db), actor: User = Depends(require_roles(*production_service.PRODUCTION_EDITOR_ROLES))):
    """Buyurtmani ishlab chiqarishga berish: har bir qatorning hali rejalashtirilmagan qismi uchun ish buyurtmasi."""
    return production_service.create_from_order(db, actor, order_id, data)
