"""Ishlab chiqarish: ish buyurtmalari, bosqich amal yozuvlari, partiya/qutilar, kuzatuv (trace), xodim KPI.

Qoidalar:
  - marshrut: Kesish → Tikuv → Pardoz → Sifat nazorati → Qadoqlash (models.production.STAGE_ROUTE);
  - bosqichda ishlangan (yaroqli + brak) miqdor oldingi bosqichning yaroqli chiqishidan oshmaydi;
    kesish — rejadan (+ ruxsat etilgan ortiqcha kesish %);
  - progress, KPI va holatlar amal yozuvlaridan hisoblanadi (alohida saqlanmaydi);
  - buyurtma holati avtomatik: birinchi ish → "Ishlab chiqarishda", barcha ish buyurtmalari tugasa → "Tayyor".
"""

import math
import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.core.scope import can_access, scoped
from app.models import (
    Employee,
    Machine,
    Material,
    Order,
    OrderItem,
    Product,
    ProductionLine,
    ProductionLog,
    ProductMovementType,
    ProductStockMovement,
    PurchaseOrder,
    Shift,
    Shipment,
    Supplier,
    TrackingUnit,
    User,
    WorkOrder,
)
from app.models.audit import AuditAction
from app.models.order import OrderStatus
from app.models.product import MaterialType
from app.models.production import STAGE_ROUTE, UnitKind, WorkOrderStatus
from app.models.resources import MachineStatus, ProductionStage
from app.schemas.production import (
    EmployeeKpi,
    FabricUsage,
    LogCreate,
    LogOut,
    ProductionSummary,
    Ref,
    StageOutput,
    StageProgress,
    TraceResult,
    UnitCreate,
    UnitOut,
    WorkOrderCreate,
    WorkOrderDetail,
    WorkOrderOut,
    WorkOrderPage,
    WorkOrdersFromOrder,
    WorkOrderUpdate,
)
from app.services import audit_service, order_service
from app.services.order_service import _check_variant
from app.core.i18n import t, stage as stage_name

PRODUCTION_VIEW_ROLES = (
    Role.SUPER_ADMIN,
    Role.FACTORY_OWNER,
    Role.MANAGER,
    Role.PRODUCTION_MANAGER,
    Role.QUALITY_MANAGER,
    Role.WAREHOUSE_MANAGER,
)
PRODUCTION_EDITOR_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER)
# Amal yozish: rahbarlar — istalgan bosqich; sifat menejeri — faqat sifat nazorati bosqichi
LOG_ROLES = PRODUCTION_EDITOR_ROLES + (Role.QUALITY_MANAGER,)
KPI_VIEW_ROLES = PRODUCTION_EDITOR_ROLES

OPEN = (WorkOrderStatus.PLANNED, WorkOrderStatus.IN_PROGRESS)
_NUMBER_RE = re.compile(r"^WO-(\d+)$")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ref(obj, code_attr: str = "code", name_attr: str = "name") -> Ref | None:
    if obj is None:
        return None
    return Ref(id=obj.id, code=getattr(obj, code_attr, None), name=getattr(obj, name_attr))


# ---------- progress ----------


def _totals(db: Session, wo_ids: list[int]) -> dict[int, dict[ProductionStage, tuple[int, int]]]:
    result: dict[int, dict[ProductionStage, tuple[int, int]]] = defaultdict(dict)
    if not wo_ids:
        return result
    rows = db.execute(
        select(ProductionLog.work_order_id, ProductionLog.stage, func.sum(ProductionLog.quantity_good), func.sum(ProductionLog.quantity_defect))
        .where(ProductionLog.work_order_id.in_(wo_ids))
        .group_by(ProductionLog.work_order_id, ProductionLog.stage)
    )
    for wo_id, stage, good, defect in rows:
        result[wo_id][stage] = (int(good or 0), int(defect or 0))
    return result


def _cut_limit(wo: WorkOrder) -> int:
    return math.floor(wo.quantity * (1 + float(wo.overcut_pct or 0) / 100))


def _progress(wo: WorkOrder, totals: dict[ProductionStage, tuple[int, int]]) -> tuple[list[StageProgress], ProductionStage | None, int]:
    progress: list[StageProgress] = []
    available = _cut_limit(wo)
    current = None
    prev_done = True
    for stage in STAGE_ROUTE:
        good, defect = totals.get(stage, (0, 0))
        done = good + defect
        remaining = max(available - done, 0)
        # Bosqich tugadi: oldingisi tugagan va reja bajarilgan yoki ishlanadigan narsa qolmagan (brak tufayli)
        stage_done = prev_done and (good >= wo.quantity or remaining == 0)
        if current is None and not stage_done:
            current = stage
        prev_done = stage_done
        progress.append(
            StageProgress(
                stage=stage, good=good, defect=defect, available=available, remaining=remaining,
                defect_rate=round(defect / done * 100, 1) if done else None,
            )
        )
        available = good
    finished = totals.get(ProductionStage.PACKING, (0, 0))[0]
    return progress, current, finished


def _wo_out(wo: WorkOrder, totals: dict[ProductionStage, tuple[int, int]], today: date | None = None) -> WorkOrderOut:
    today = today or date.today()
    progress, current, finished = _progress(wo, totals)
    return WorkOrderOut(
        id=wo.id, factory_id=wo.factory_id, number=wo.number, order_id=wo.order_id,
        order_number=wo.order.order_number if wo.order else None,
        customer_name=wo.order.customer_name if wo.order else None,
        product_id=wo.product_id, product_name=wo.product_name, product_code=wo.product_code, size=wo.size, color=wo.color,
        quantity=wo.quantity, overcut_pct=float(wo.overcut_pct or 0), status=wo.status, line=_ref(wo.line),
        planned_start=wo.planned_start, planned_end=wo.planned_end, priority=wo.priority, notes=wo.notes,
        started_at=wo.started_at, completed_at=wo.completed_at, created_at=wo.created_at,
        progress=progress, current_stage=current if wo.status in OPEN else None, finished=finished,
        percent=round(min(finished / wo.quantity * 100, 100), 1) if wo.quantity else 0,
        is_late=wo.status in OPEN and wo.planned_end is not None and wo.planned_end < today,
    )


# ---------- ish buyurtmalari ----------


def _load(db: Session, actor: User, wo_id: int) -> WorkOrder:
    wo = db.scalar(
        select(WorkOrder).options(selectinload(WorkOrder.order), selectinload(WorkOrder.line)).where(WorkOrder.id == wo_id)
    )
    if wo is None or not can_access(actor, wo.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ish buyurtmasi topilmadi")
    return wo


def _lock_row(db: Session, wo: WorkOrder) -> None:
    """PostgreSQL: ish buyurtmasi qatorini tranzaksiya oxirigacha qulflash (SQLite'da e'tiborsiz)."""
    if db.bind.dialect.name == "postgresql":
        db.execute(select(WorkOrder.id).where(WorkOrder.id == wo.id).with_for_update())


def _next_number(db: Session, factory_id: int) -> str:
    numbers = [int(m.group(1)) for n in db.scalars(select(WorkOrder.number).where(WorkOrder.factory_id == factory_id)) if (m := _NUMBER_RE.match(n))]
    return f"WO-{max(numbers, default=0) + 1:06d}"


def _planned_for_item(db: Session, item_id: int, exclude_wo: int | None = None) -> int:
    q = select(func.coalesce(func.sum(WorkOrder.quantity), 0)).where(WorkOrder.order_item_id == item_id, WorkOrder.status != WorkOrderStatus.CANCELLED)
    if exclude_wo:
        q = q.where(WorkOrder.id != exclude_wo)
    return int(db.scalar(q) or 0)


def _check_line(db: Session, line_id: int | None, factory_id: int) -> None:
    if line_id is not None:
        line = db.get(ProductionLine, line_id)
        if line is None or line.factory_id != factory_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Liniya topilmadi")


def _check_dates(start: date | None, end: date | None) -> None:
    if start and end and end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tugash sanasi boshlanishdan oldin bo'lmasin")


def _new_work_order(db: Session, actor: User, product: Product, *, quantity: int, size, color, item: OrderItem | None,
                    line_id, planned_start, planned_end, priority: int, overcut_pct: float, notes) -> WorkOrder:
    wo = WorkOrder(
        factory_id=product.factory_id, number=_next_number(db, product.factory_id),
        order_id=item.order_id if item else None, order_item_id=item.id if item else None,
        product_id=product.id, product_name=product.name, product_code=product.code, size=size, color=color,
        quantity=quantity, overcut_pct=Decimal(str(overcut_pct)), status=WorkOrderStatus.PLANNED, line_id=line_id,
        planned_start=planned_start, planned_end=planned_end, priority=priority, notes=notes, created_by_id=actor.id,
    )
    db.add(wo)
    db.flush()
    audit_service.record(db, actor, entity="work_order", entity_id=wo.id, action=AuditAction.CREATE,
                         summary=f"Ish buyurtmasi {wo.number}: {product.code} × {quantity}", factory_id=wo.factory_id)
    return wo


def create_work_order(db: Session, actor: User, data: WorkOrderCreate) -> WorkOrderDetail:
    product = db.get(Product, data.product_id)
    if product is None or not can_access(actor, product.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mahsulot topilmadi")
    item = None
    size, color = data.size, data.color
    if data.order_item_id is not None:
        item = db.get(OrderItem, data.order_item_id)
        if item is None or item.order.factory_id != product.factory_id or item.product_id != product.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Buyurtma qatori bu mahsulotga tegishli emas")
        if item.order.status in (OrderStatus.PENDING_PAYMENT, OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED):
            raise HTTPException(status.HTTP_409_CONFLICT, "To'lanmagan, jo'natilgan, yakunlangan yoki bekor qilingan buyurtma ishlab chiqarishga berilmaydi")
        size, color = size or item.size, color or item.color
        left = item.quantity - _planned_for_item(db, item.id)
        if data.quantity > left:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("Bu qator uchun faqat {left} dona rejalashtirish mumkin", left=max(left, 0)))
    _check_variant(product, size, color)
    _check_line(db, data.line_id, product.factory_id)
    _check_dates(data.planned_start, data.planned_end)
    wo = _new_work_order(db, actor, product, quantity=data.quantity, size=size, color=color, item=item, line_id=data.line_id,
                         planned_start=data.planned_start, planned_end=data.planned_end, priority=data.priority,
                         overcut_pct=data.overcut_pct, notes=data.notes)
    db.commit()
    return get_work_order(db, actor, wo.id)


def create_from_order(db: Session, actor: User, order_id: int, data: WorkOrdersFromOrder) -> list[WorkOrderOut]:
    """Buyurtmaning hali rejalashtirilmagan qismi uchun ish buyurtmalari (qator bo'yicha)."""
    order = db.scalar(select(Order).options(selectinload(Order.items)).where(Order.id == order_id))
    if order is None or not can_access(actor, order.factory_id) or order.status == OrderStatus.PENDING_PAYMENT:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buyurtma topilmadi")
    if order.status in (OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Jo'natilgan, yakunlangan yoki bekor qilingan buyurtma ishlab chiqarishga berilmaydi")
    _check_line(db, data.line_id, order.factory_id)
    end = data.planned_end or order.due_date
    _check_dates(data.planned_start, end)
    created = []
    for item in order.items:
        product = db.get(Product, item.product_id) if item.product_id else None
        left = item.quantity - _planned_for_item(db, item.id)
        if product is None or left <= 0:
            continue
        created.append(
            _new_work_order(db, actor, product, quantity=left, size=item.size, color=item.color, item=item, line_id=data.line_id,
                            planned_start=data.planned_start, planned_end=end, priority=0, overcut_pct=data.overcut_pct, notes=None)
        )
    if not created:
        raise HTTPException(status.HTTP_409_CONFLICT, "Barcha qatorlar allaqachon ishlab chiqarishga berilgan")
    if order.status == OrderStatus.NEW:
        _set_order_status(db, actor, order, OrderStatus.CONFIRMED, "ishlab chiqarishga berildi")
    db.commit()
    totals = _totals(db, [w.id for w in created])
    return [_wo_out(_load(db, actor, w.id), totals[w.id]) for w in created]


def list_work_orders(
    db: Session,
    actor: User,
    *,
    search: str | None = None,
    status_: WorkOrderStatus | None = None,
    active: bool = False,
    late: bool = False,
    line_id: int | None = None,
    order_id: int | None = None,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> WorkOrderPage:
    query = scoped(select(WorkOrder), actor, WorkOrder.factory_id, factory_id)
    if search:
        p = f"%{search.strip()}%"
        query = query.outerjoin(Order, Order.id == WorkOrder.order_id).where(
            or_(WorkOrder.number.ilike(p), WorkOrder.product_name.ilike(p), WorkOrder.product_code.ilike(p), Order.order_number.ilike(p), Order.customer_name.ilike(p))
        )
    if status_ is not None:
        query = query.where(WorkOrder.status == status_)
    if active or late:
        query = query.where(WorkOrder.status.in_(OPEN))
    if late:
        query = query.where(WorkOrder.planned_end < date.today())
    if line_id is not None:
        query = query.where(WorkOrder.line_id == line_id)
    if order_id is not None:
        query = query.where(WorkOrder.order_id == order_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list(
        db.scalars(
            query.options(selectinload(WorkOrder.order), selectinload(WorkOrder.line))
            .order_by(
                case((WorkOrder.status.in_(OPEN), 0), else_=1),
                WorkOrder.priority.desc(),
                WorkOrder.planned_end.asc().nulls_last(),
                WorkOrder.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
    )
    totals = _totals(db, [w.id for w in rows])
    today = date.today()
    return WorkOrderPage(items=[_wo_out(w, totals[w.id], today) for w in rows], total=total)


def _fabric(db: Session, wo: WorkOrder, totals: dict[ProductionStage, tuple[int, int]]) -> FabricUsage:
    used, waste = db.execute(
        select(func.coalesce(func.sum(ProductionLog.fabric_used), 0), func.coalesce(func.sum(ProductionLog.fabric_waste), 0))
        .where(ProductionLog.work_order_id == wo.id, ProductionLog.stage == ProductionStage.CUTTING)
    ).one()
    used, waste = float(used), float(waste)
    per_piece_planned = None
    product = db.scalar(select(Product).options(selectinload(Product.bom_items)).where(Product.id == wo.product_id)) if wo.product_id else None
    if product:
        fabric = [b for b in product.bom_items if b.material_type == MaterialType.FABRIC]
        if fabric:
            per_piece_planned = round(sum(float(b.quantity) * (1 + float(b.waste_percent) / 100) for b in fabric), 4)
    cut = sum(totals.get(ProductionStage.CUTTING, (0, 0)))
    return FabricUsage(
        planned=round(per_piece_planned * wo.quantity, 3) if per_piece_planned is not None else None,
        used=round(used, 3), waste=round(waste, 3), waste_pct=round(waste / used * 100, 1) if used else None,
        per_piece=round(used / cut, 4) if cut and used else None, per_piece_planned=per_piece_planned,
    )


def _log_out(log: ProductionLog, number: str | None = None) -> LogOut:
    return LogOut(
        id=log.id, work_order_id=log.work_order_id, work_order_number=number, stage=log.stage, work_date=log.work_date,
        quantity_good=log.quantity_good, quantity_defect=log.quantity_defect, defect_reason=log.defect_reason,
        fabric_used=float(log.fabric_used) if log.fabric_used is not None else None,
        fabric_waste=float(log.fabric_waste) if log.fabric_waste is not None else None,
        duration_minutes=log.duration_minutes,
        employee=_ref(log.employee, "employee_code", "full_name"), machine=_ref(log.machine), line=_ref(log.line),
        shift=Ref(id=log.shift.id, name=log.shift.name) if log.shift else None, unit_code=log.unit.code if log.unit else None,
        source=log.source, note=log.note, created_by_name=log.created_by.full_name if log.created_by else None, created_at=log.created_at,
    )


_LOG_OPTS = (
    selectinload(ProductionLog.employee), selectinload(ProductionLog.machine), selectinload(ProductionLog.line),
    selectinload(ProductionLog.shift), selectinload(ProductionLog.unit), selectinload(ProductionLog.created_by),
)


# Birlik qaysi bosqich chiqishidan tuziladi: partiya — kesilgan donadan, quti — sifatdan o'tgan donadan.
# Shu bosqichgacha bo'lgan yo'l birlik uchun o'tilgan hisoblanadi (u bosqichlar birlik kodisiz qayd etiladi).
_UNIT_ORIGIN = {UnitKind.BUNDLE: ProductionStage.CUTTING, UnitKind.BOX: ProductionStage.QUALITY_CONTROL}


def _unit_out(u: TrackingUnit, wo: WorkOrder, stages: list[ProductionStage] | None = None) -> UnitOut:
    done = set(stages or []) | set(STAGE_ROUTE[: STAGE_ROUTE.index(_UNIT_ORIGIN[u.kind]) + 1])
    return UnitOut(
        id=u.id, work_order_id=wo.id, work_order_number=wo.number, kind=u.kind, code=u.code, quantity=u.quantity,
        size=u.size, color=u.color, product_name=wo.product_name, note=u.note, created_at=u.created_at,
        stages_done=[s for s in STAGE_ROUTE if s in done],
    )


def get_work_order(db: Session, actor: User, wo_id: int) -> WorkOrderDetail:
    wo = _load(db, actor, wo_id)
    totals = _totals(db, [wo.id])[wo.id]
    logs = db.scalars(
        select(ProductionLog).options(*_LOG_OPTS).where(ProductionLog.work_order_id == wo.id)
        .order_by(ProductionLog.work_date.desc(), ProductionLog.id.desc()).limit(200)
    )
    units = list(db.scalars(select(TrackingUnit).where(TrackingUnit.work_order_id == wo.id).order_by(TrackingUnit.id)))
    stages = _unit_stages(db, [u.id for u in units])
    return WorkOrderDetail(
        **_wo_out(wo, totals).model_dump(),
        logs=[_log_out(l, wo.number) for l in logs],
        units=[_unit_out(u, wo, stages.get(u.id)) for u in units],
        fabric=_fabric(db, wo, totals),
    )


def update_work_order(db: Session, actor: User, wo_id: int, data: WorkOrderUpdate) -> WorkOrderDetail:
    wo = _load(db, actor, wo_id)
    if wo.status not in OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yakunlangan yoki bekor qilingan ish buyurtmasi o'zgartirilmaydi")
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k in ("line_id", "planned_start", "planned_end", "notes")}
    if "quantity" in values:
        cut = sum(_totals(db, [wo.id])[wo.id].get(ProductionStage.CUTTING, (0, 0)))
        if values["quantity"] < math.ceil(cut / (1 + float(values.get("overcut_pct", wo.overcut_pct) or 0) / 100)):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("Allaqachon {cut} dona kesilgan — rejani undan kam qilib bo'lmaydi", cut=cut))
        if wo.order_item_id:
            item = db.get(OrderItem, wo.order_item_id)
            left = item.quantity - _planned_for_item(db, item.id, exclude_wo=wo.id)
            if values["quantity"] > left:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("Buyurtma qatori uchun ko'pi bilan {left} dona", left=left))
    if "line_id" in values:
        _check_line(db, values["line_id"], wo.factory_id)
    _check_dates(values.get("planned_start", wo.planned_start), values.get("planned_end", wo.planned_end))
    if "overcut_pct" in values:
        values["overcut_pct"] = Decimal(str(values["overcut_pct"]))
    changes = audit_service.diff(wo, values)
    for k, v in values.items():
        setattr(wo, k, v)
    if changes:
        audit_service.record(db, actor, entity="work_order", entity_id=wo.id, action=AuditAction.UPDATE,
                             summary=f"Ish buyurtmasi {wo.number} o'zgartirildi", factory_id=wo.factory_id, changes=changes)
    db.commit()
    db.expire(wo)
    return get_work_order(db, actor, wo.id)


def set_work_order_status(db: Session, actor: User, wo_id: int, new_status: WorkOrderStatus) -> WorkOrderDetail:
    """Qo'lda yakunlash (masalan, qisman bajarilgan) yoki bekor qilish."""
    wo = _load(db, actor, wo_id)
    if wo.status not in OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ish buyurtmasi allaqachon yopilgan")
    if new_status not in (WorkOrderStatus.COMPLETED, WorkOrderStatus.CANCELLED):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Faqat yakunlash yoki bekor qilish mumkin")
    if new_status == WorkOrderStatus.COMPLETED:
        finished = _totals(db, [wo.id])[wo.id].get(ProductionStage.PACKING, (0, 0))[0]
        if finished == 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "Hali hech narsa qadoqlanmagan — yakunlab bo'lmaydi (bekor qilish mumkin)")
    _close(db, actor, wo, new_status)
    db.commit()
    return get_work_order(db, actor, wo.id)


# ---------- buyurtma holati bilan bog'lanish ----------


_set_order_status = order_service.change_status


def _close(db: Session, actor: User, wo: WorkOrder, new_status: WorkOrderStatus) -> None:
    wo.status = new_status
    wo.completed_at = _now()
    audit_service.record(db, actor, entity="work_order", entity_id=wo.id, action=AuditAction.STATUS,
                         summary=f"Ish buyurtmasi {wo.number}: {new_status.value}", factory_id=wo.factory_id)
    db.flush()
    if wo.order_id is None:
        return
    order = db.get(Order, wo.order_id)
    siblings = list(db.scalars(select(WorkOrder.status).where(WorkOrder.order_id == order.id)))
    if order.status == OrderStatus.IN_PRODUCTION and all(s not in OPEN for s in siblings) and WorkOrderStatus.COMPLETED in siblings:
        _set_order_status(db, actor, order, OrderStatus.READY, "barcha ish buyurtmalari tugadi")


# ---------- amal yozuvlari ----------


def _same_factory(db: Session, model, obj_id: int | None, factory_id: int, label: str):
    if obj_id is None:
        return None
    obj = db.get(model, obj_id)
    if obj is None or obj.factory_id != factory_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("{label} topilmadi", label=label))
    return obj


STAGE_NAMES = {
    ProductionStage.CUTTING: "Kesish",
    ProductionStage.SEWING: "Tikuv",
    ProductionStage.FINISHING: "Pardoz",
    ProductionStage.QUALITY_CONTROL: "Sifat nazorati",
    ProductionStage.PACKING: "Qadoqlash",
}


def add_log(db: Session, actor: User, wo_id: int, data: LogCreate) -> WorkOrderDetail:
    wo = _load(db, actor, wo_id)
    _lock_row(db, wo)  # bir vaqtdagi ikki yozuv bosqich chegarasidan oshib ketmasin
    if actor.role == Role.QUALITY_MANAGER and data.stage != ProductionStage.QUALITY_CONTROL:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sifat menejeri faqat sifat nazorati natijasini kiritadi")
    if wo.status not in OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yakunlangan yoki bekor qilingan ish buyurtmasiga yozib bo'lmaydi")
    if data.quantity_good + data.quantity_defect == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Yaroqli yoki brak miqdorini kiriting")
    if data.quantity_defect and not data.defect_reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Brak sababini yozing")
    if data.stage != ProductionStage.CUTTING and (data.fabric_used is not None or data.fabric_waste is not None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Mato sarfi faqat kesish bosqichida kiritiladi")
    work_date = data.work_date or date.today()
    if work_date > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Kelajakdagi sana bo'lmasin")

    # Bosqich nazorati: oldingi bosqichdan kelgandan ko'p ishlab bo'lmaydi
    totals = _totals(db, [wo.id])[wo.id]
    progress, _, _ = _progress(wo, totals)
    p = next(x for x in progress if x.stage == data.stage)
    new_done = data.quantity_good + data.quantity_defect
    if new_done > p.remaining:
        idx = STAGE_ROUTE.index(data.stage)
        source_text = t("reja") + (t(" (+{pct}% ortiqcha kesish)", pct=f"{float(wo.overcut_pct):g}") if wo.overcut_pct else "") if idx == 0 else t("«{stage}» bosqichidan kelgan yaroqli", stage=stage_name(STAGE_NAMES[STAGE_ROUTE[idx - 1]]))
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            t("{stage}: yana ko'pi bilan {remaining} dona kiritish mumkin ({source} — {available} dona, ishlangan — {done})", stage=stage_name(STAGE_NAMES[data.stage]), remaining=p.remaining, source=source_text, available=p.available, done=p.good + p.defect),
        )

    employee = _same_factory(db, Employee, data.employee_id, wo.factory_id, "Xodim")
    machine = _same_factory(db, Machine, data.machine_id, wo.factory_id, "Mashina")
    if machine is not None and machine.status in (MachineStatus.BROKEN, MachineStatus.MAINTENANCE):
        raise HTTPException(status.HTTP_409_CONFLICT, t("{code} mashinasi hozir ishlamaydi ({status}) — holatini yangilang", code=machine.code, status=machine.status.value))
    line_id = data.line_id or (employee.line_id if employee else None) or wo.line_id
    _same_factory(db, ProductionLine, line_id, wo.factory_id, "Liniya")
    shift_id = data.shift_id or (employee.shift_id if employee else None)
    _same_factory(db, Shift, shift_id, wo.factory_id, "Smena")
    unit = None
    if data.unit_code:
        unit = db.scalar(select(TrackingUnit).where(TrackingUnit.factory_id == wo.factory_id, TrackingUnit.code == data.unit_code.strip().upper()))
        if unit is None or unit.work_order_id != wo.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Partiya/quti bu ish buyurtmasiga tegishli emas")

    db.add(
        ProductionLog(
            factory_id=wo.factory_id, work_order_id=wo.id, stage=data.stage, work_date=work_date,
            quantity_good=data.quantity_good, quantity_defect=data.quantity_defect, defect_reason=data.defect_reason,
            fabric_used=Decimal(str(data.fabric_used)) if data.fabric_used is not None else None,
            fabric_waste=Decimal(str(data.fabric_waste)) if data.fabric_waste is not None else None,
            duration_minutes=data.duration_minutes, employee_id=employee.id if employee else None,
            machine_id=machine.id if machine else None, line_id=line_id, shift_id=shift_id,
            unit_id=unit.id if unit else None, source=data.source, note=data.note, created_by_id=actor.id,
        )
    )
    if wo.status == WorkOrderStatus.PLANNED:
        wo.status, wo.started_at = WorkOrderStatus.IN_PROGRESS, _now()
        if wo.order_id:
            order = db.get(Order, wo.order_id)
            if order.status in (OrderStatus.NEW, OrderStatus.CONFIRMED):
                _set_order_status(db, actor, order, OrderStatus.IN_PRODUCTION, f"{wo.number} boshlandi")
    db.flush()
    finished = _totals(db, [wo.id])[wo.id].get(ProductionStage.PACKING, (0, 0))[0]
    if finished >= wo.quantity:
        _close(db, actor, wo, WorkOrderStatus.COMPLETED)
    db.commit()
    return get_work_order(db, actor, wo.id)


def delete_log(db: Session, actor: User, log_id: int) -> WorkOrderDetail:
    """Xato kiritilgan yozuvni bekor qilish (keyingi bosqich unga tayanmagan bo'lsa)."""
    log = db.get(ProductionLog, log_id)
    if log is None or not can_access(actor, log.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Yozuv topilmadi")
    wo = _load(db, actor, log.work_order_id)
    _lock_row(db, wo)
    if wo.status not in OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yopilgan ish buyurtmasining yozuvi o'chirilmaydi")
    totals = _totals(db, [wo.id])[wo.id]
    if log.stage == ProductionStage.PACKING:
        # Tayyor mahsulot omboriga qabul qilingan miqdor qadoqlangandan oshib ketmasin
        received = int(db.scalar(select(func.coalesce(func.sum(ProductStockMovement.quantity), 0)).where(
            ProductStockMovement.work_order_id == wo.id, ProductStockMovement.movement_type == ProductMovementType.PRODUCTION)) or 0)
        if totals.get(ProductionStage.PACKING, (0, 0))[0] - log.quantity_good < received:
            raise HTTPException(status.HTTP_409_CONFLICT, t("Omborga {received} dona qabul qilingan — bu qadoqlash yozuvini o'chirib bo'lmaydi", received=received))
    idx = STAGE_ROUTE.index(log.stage)
    if idx + 1 < len(STAGE_ROUTE):
        nxt = STAGE_ROUTE[idx + 1]
        good_after = totals.get(log.stage, (0, 0))[0] - log.quantity_good
        if sum(totals.get(nxt, (0, 0))) > good_after:
            raise HTTPException(status.HTTP_409_CONFLICT, t("«{stage}» bosqichi bu miqdorni allaqachon ishlagan — avval o'sha yozuvni o'chiring", stage=stage_name(STAGE_NAMES[nxt])))
    audit_service.record(db, actor, entity="work_order", entity_id=wo.id, action=AuditAction.DELETE,
                         summary=f"{wo.number}: {STAGE_NAMES[log.stage]} yozuvi o'chirildi ({log.quantity_good} yaroqli, {log.quantity_defect} brak, {log.work_date})",
                         factory_id=wo.factory_id)
    db.delete(log)
    db.commit()
    return get_work_order(db, actor, wo.id)


# ---------- partiya / qutilar ----------


def _unit_stages(db: Session, unit_ids: list[int]) -> dict[int, list[ProductionStage]]:
    out: dict[int, list[ProductionStage]] = defaultdict(list)
    if unit_ids:
        for uid, stage in db.execute(select(ProductionLog.unit_id, ProductionLog.stage).where(ProductionLog.unit_id.in_(unit_ids)).distinct()):
            out[uid].append(stage)
    return {k: sorted(v, key=STAGE_ROUTE.index) for k, v in out.items()}


def create_unit(db: Session, actor: User, wo_id: int, data: UnitCreate) -> WorkOrderDetail:
    wo = _load(db, actor, wo_id)
    if wo.status == WorkOrderStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bekor qilingan ish buyurtmasi")
    totals = _totals(db, [wo.id])[wo.id]
    # Partiya — kesilgan yaroqli miqdor ichida; quti — sifatdan o'tgan miqdor ichida
    source_stage = ProductionStage.CUTTING if data.kind == UnitKind.BUNDLE else ProductionStage.QUALITY_CONTROL
    limit = totals.get(source_stage, (0, 0))[0]
    used = db.scalar(select(func.coalesce(func.sum(TrackingUnit.quantity), 0)).where(TrackingUnit.work_order_id == wo.id, TrackingUnit.kind == data.kind)) or 0
    if used + data.quantity > limit:
        label = "kesilgan" if data.kind == UnitKind.BUNDLE else "sifat nazoratidan o'tgan"
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("{label} {limit} dona, ulardan {used} tasi allaqachon partiyalarga ajratilgan" if data.kind == UnitKind.BUNDLE else "{label} {limit} dona, ulardan {used} tasi allaqachon qutilarga ajratilgan", label=label.capitalize(), limit=limit, used=used))
    n = (db.scalar(select(func.count()).select_from(TrackingUnit).where(TrackingUnit.work_order_id == wo.id, TrackingUnit.kind == data.kind)) or 0) + 1
    code = f"{wo.number}-{'P' if data.kind == UnitKind.BUNDLE else 'Q'}{n:02d}"
    db.add(TrackingUnit(factory_id=wo.factory_id, work_order_id=wo.id, kind=data.kind, code=code, quantity=data.quantity,
                        size=wo.size, color=wo.color, note=data.note, created_by_id=actor.id))
    db.commit()
    return get_work_order(db, actor, wo.id)


# ---------- kuzatuv (QR / shtrix-kod) ----------


def trace(db: Session, actor: User, code: str) -> TraceResult:
    code = code.strip().upper()
    if not code:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Kodni kiriting")

    def one(model, col):
        return db.scalar(scoped(select(model).where(col == code), actor, model.factory_id).limit(1))

    unit = one(TrackingUnit, TrackingUnit.code)
    if unit:
        wo = _load(db, actor, unit.work_order_id)
        logs = db.scalars(select(ProductionLog).options(*_LOG_OPTS).where(ProductionLog.unit_id == unit.id).order_by(ProductionLog.work_date, ProductionLog.id))
        stages = _unit_stages(db, [unit.id]).get(unit.id)
        kind_name = "Partiya" if unit.kind == UnitKind.BUNDLE else "Quti"
        return TraceResult(
            kind=unit.kind.value, code=unit.code, title=f"{kind_name} {unit.code}", subtitle=f"{wo.product_name} · {unit.quantity} dona",
            path=f"/production/{wo.id}", work_order=_wo_out(wo, _totals(db, [wo.id])[wo.id]), unit=_unit_out(unit, wo, stages),
            logs=[_log_out(l, wo.number) for l in logs],
        )
    wo = one(WorkOrder, WorkOrder.number)
    if wo:
        wo = _load(db, actor, wo.id)
        return TraceResult(kind="WORK_ORDER", code=wo.number, title=f"Ish buyurtmasi {wo.number}", subtitle=f"{wo.product_name} × {wo.quantity}",
                           path=f"/production/{wo.id}", work_order=_wo_out(wo, _totals(db, [wo.id])[wo.id]))
    order = db.scalar(scoped(select(Order).where(Order.order_number == code, Order.status != OrderStatus.PENDING_PAYMENT), actor, Order.factory_id).limit(1))
    if order:
        return TraceResult(kind="ORDER", code=code, title=f"Buyurtma {code}", subtitle=order.customer_name, path=f"/orders/{order.id}")
    material = one(Material, Material.code)
    if material:
        return TraceResult(kind="MATERIAL", code=code, title=f"Material {code}", subtitle=material.name, path=f"/inventory/materials/{material.id}")
    machine = one(Machine, Machine.code)
    if machine:
        return TraceResult(kind="MACHINE", code=code, title=f"Mashina {code}", subtitle=machine.name, path=f"/machines/{machine.id}")
    shipment = one(Shipment, Shipment.number)
    if shipment:
        order = db.get(Order, shipment.order_id)
        return TraceResult(kind="SHIPMENT", code=code, title=f"Jo'natma {code}", subtitle=f"{order.order_number} · {order.customer_name}",
                           path=f"/shipments/{shipment.id}")
    po = one(PurchaseOrder, PurchaseOrder.number)
    if po:
        return TraceResult(kind="PURCHASE_ORDER", code=code, title=f"Xarid buyurtmasi {code}", subtitle=db.get(Supplier, po.supplier_id).name,
                           path=f"/purchases/{po.id}")
    raise HTTPException(status.HTTP_404_NOT_FOUND, t("«{code}» kodi topilmadi", code=code))


# ---------- KPI va umumiy ko'rsatkichlar ----------


def employee_kpi(db: Session, actor: User, *, date_from: date, date_to: date, line_id: int | None = None, factory_id: int | None = None) -> list[EmployeeKpi]:
    if date_to < date_from:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sana oralig'i noto'g'ri")
    query = scoped(
        select(
            ProductionLog.employee_id,
            func.sum(ProductionLog.quantity_good),
            func.sum(ProductionLog.quantity_defect),
            func.count(func.distinct(ProductionLog.work_date)),
            func.coalesce(func.sum(ProductionLog.duration_minutes), 0),
        ).where(ProductionLog.employee_id.is_not(None), ProductionLog.work_date >= date_from, ProductionLog.work_date <= date_to),
        actor, ProductionLog.factory_id, factory_id,
    ).group_by(ProductionLog.employee_id)
    if line_id is not None:
        query = query.where(ProductionLog.line_id == line_id)
    rows = db.execute(query).all()
    employees = {e.id: e for e in db.scalars(select(Employee).options(selectinload(Employee.line)).where(Employee.id.in_([r[0] for r in rows])))}
    result = []
    for emp_id, good, defect, days, minutes in rows:
        e = employees[emp_id]
        good, defect, minutes = int(good or 0), int(defect or 0), int(minutes or 0)
        norm_total = e.daily_norm * days if e.daily_norm else None
        result.append(
            EmployeeKpi(
                employee=Ref(id=e.id, code=e.employee_code, name=e.full_name), department=e.department, line=_ref(e.line),
                days_worked=days, good=good, defect=defect,
                defect_rate=round(defect / (good + defect) * 100, 1) if good + defect else None,
                daily_norm=e.daily_norm, norm_total=norm_total,
                efficiency_pct=round(good / norm_total * 100, 1) if norm_total else None,
                minutes=minutes, per_hour=round(good / (minutes / 60), 1) if minutes else None,
            )
        )
    result.sort(key=lambda k: (k.efficiency_pct is None, -(k.efficiency_pct or 0), -k.good))
    return result


def _stage_output(db: Session, actor: User, since: date, factory_id: int | None) -> list[StageOutput]:
    rows = dict(
        (stage, (int(g or 0), int(d or 0)))
        for stage, g, d in db.execute(
            scoped(
                select(ProductionLog.stage, func.sum(ProductionLog.quantity_good), func.sum(ProductionLog.quantity_defect)).where(ProductionLog.work_date >= since),
                actor, ProductionLog.factory_id, factory_id,
            ).group_by(ProductionLog.stage)
        )
    )
    out = []
    for stage in STAGE_ROUTE:
        g, d = rows.get(stage, (0, 0))
        out.append(StageOutput(stage=stage, good=g, defect=d, defect_rate=round(d / (g + d) * 100, 1) if g + d else None))
    return out


def summary(db: Session, actor: User, factory_id: int | None = None) -> ProductionSummary:
    today = date.today()
    wos = scoped(select(WorkOrder.status, WorkOrder.planned_end, WorkOrder.completed_at), actor, WorkOrder.factory_id, factory_id)
    active = late = completed = 0
    month_ago = _now() - timedelta(days=30)
    for st, end, done_at in db.execute(wos):
        if st in OPEN:
            active += 1
            late += bool(end and end < today)
        elif st == WorkOrderStatus.COMPLETED and done_at and (done_at if done_at.tzinfo else done_at.replace(tzinfo=timezone.utc)) >= month_ago:
            completed += 1
    used, waste = db.execute(
        scoped(
            select(func.coalesce(func.sum(ProductionLog.fabric_used), 0), func.coalesce(func.sum(ProductionLog.fabric_waste), 0)).where(ProductionLog.work_date >= today - timedelta(days=30)),
            actor, ProductionLog.factory_id, factory_id,
        )
    ).one()
    used, waste = float(used), float(waste)
    return ProductionSummary(
        work_orders_active=active, work_orders_late=late, completed_30d=completed,
        output_today=_stage_output(db, actor, today, factory_id), output_7d=_stage_output(db, actor, today - timedelta(days=6), factory_id),
        fabric_used_30d=round(used, 3), fabric_waste_30d=round(waste, 3), waste_pct_30d=round(waste / used * 100, 1) if used else None,
    )
