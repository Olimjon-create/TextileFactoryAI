"""Ta'minot: yetkazib beruvchilar, xarid buyurtmalari va ularni omborga qabul qilish.

Qoidalar:
  - qabul qilingan miqdor = Σ ombor kirimlari (stock_movements.purchase_item_id); alohida saqlanmaydi;
  - qabul qilish oddiy ombor kirimi orqali (inventory_service.create_movement) — qoldiq, tannarx
    (materials.unit_cost) va audit bir joyda yangilanadi;
  - holat: Qoralama → Yuborildi → Qisman / To'liq qabul qilindi (avtomatik); qolgani kelmasa — Yopish;
  - qatorlar faqat qoralamada o'zgaradi; buyurtmadan ortiq qabul qilinmaydi.
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.numbering import next_number
from app.core.scope import can_access, resolve_factory_id, scoped
from app.models import (
    Material,
    MovementType,
    Order,
    PurchaseOrder,
    PurchaseOrderItem,
    PurchaseStatus,
    StockMovement,
    Supplier,
    User,
    WarehouseLocation,
)
from app.models.audit import AuditAction
from app.schemas.inventory import MovementCreate, MovementInput
from app.schemas.procurement import (
    ProcurementSummary,
    PurchaseLineIn,
    PurchaseLineOut,
    PurchaseOrderCreate,
    PurchaseOrderDetail,
    PurchaseOrderOut,
    PurchaseOrderPage,
    PurchaseOrderUpdate,
    ReceiveRequest,
    Ref,
    SupplierCreate,
    SupplierDetail,
    SupplierOut,
    SupplierPage,
    SupplierStats,
    SupplierUpdate,
)
from app.services import audit_service, inventory_service
from app.core.i18n import t

PROCUREMENT_VIEW_ROLES = inventory_service.INVENTORY_VIEW_ROLES
PROCUREMENT_EDITOR_ROLES = inventory_service.INVENTORY_EDITOR_ROLES

OPEN = (PurchaseStatus.ORDERED, PurchaseStatus.PARTIAL)
STATUS_LABELS = {
    PurchaseStatus.DRAFT: "Qoralama",
    PurchaseStatus.ORDERED: "Yuborildi",
    PurchaseStatus.PARTIAL: "Qisman qabul qilindi",
    PurchaseStatus.RECEIVED: "Qabul qilindi",
    PurchaseStatus.CLOSED: "Yopildi",
    PurchaseStatus.CANCELLED: "Bekor qilindi",
}
Q = Decimal("0.001")


def _q(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Q)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_supplier(db: Session, actor: User, supplier_id: int) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None or not can_access(actor, supplier.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Yetkazib beruvchi topilmadi")
    return supplier


def _supplier_code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None) -> None:
    q = select(Supplier.id).where(Supplier.factory_id == factory_id, Supplier.code == code)
    if exclude_id is not None:
        q = q.where(Supplier.id != exclude_id)
    if db.scalar(q) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, t("'{code}' kodli yetkazib beruvchi allaqachon mavjud", code=code))


def _received_by_item(db: Session, item_ids: list[int]) -> dict[int, Decimal]:
    if not item_ids:
        return {}
    rows = db.execute(
        select(StockMovement.purchase_item_id, func.sum(StockMovement.quantity))
        .where(StockMovement.purchase_item_id.in_(item_ids), StockMovement.movement_type == MovementType.RECEIPT)
        .group_by(StockMovement.purchase_item_id)
    )
    return {item_id: _q(total) for item_id, total in rows}


def _supplier_figures(db: Session, supplier_ids: list[int]) -> tuple[dict[int, int], dict[int, float]]:
    """Ro'yxat uchun: ochiq buyurtmalar soni va qabul qilingan tovar qiymati (yetkazib beruvchi bo'yicha)."""
    if not supplier_ids:
        return {}, {}
    open_counts = dict(
        db.execute(
            select(PurchaseOrder.supplier_id, func.count())
            .where(PurchaseOrder.supplier_id.in_(supplier_ids), PurchaseOrder.status.in_(OPEN))
            .group_by(PurchaseOrder.supplier_id)
        ).all()
    )
    values = dict(
        db.execute(
            select(PurchaseOrder.supplier_id, func.sum(StockMovement.quantity * PurchaseOrderItem.unit_price))
            .join(PurchaseOrderItem, PurchaseOrderItem.id == StockMovement.purchase_item_id)
            .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
            .where(PurchaseOrder.supplier_id.in_(supplier_ids), StockMovement.movement_type == MovementType.RECEIPT)
            .group_by(PurchaseOrder.supplier_id)
        ).all()
    )
    return open_counts, {k: round(float(v or 0), 2) for k, v in values.items()}


def _supplier_out(s: Supplier, open_counts: dict[int, int], values: dict[int, float]) -> SupplierOut:
    out = SupplierOut.model_validate(s)
    out.open_orders = open_counts.get(s.id, 0)
    out.received_value = values.get(s.id, 0)
    return out


def list_suppliers(
    db: Session, actor: User, *, search: str | None = None, is_active: bool | None = True,
    factory_id: int | None = None, offset: int = 0, limit: int = 25,
) -> SupplierPage:
    query = scoped(select(Supplier), actor, Supplier.factory_id, factory_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Supplier.name.ilike(pattern), Supplier.code.ilike(pattern), Supplier.phone.ilike(pattern), Supplier.contact_person.ilike(pattern)))
    if is_active is not None:
        query = query.where(Supplier.is_active.is_(is_active))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list(db.scalars(query.order_by(Supplier.name, Supplier.id).offset(offset).limit(limit)))
    open_counts, values = _supplier_figures(db, [s.id for s in rows])
    return SupplierPage(items=[_supplier_out(s, open_counts, values) for s in rows], total=total)


def get_supplier(db: Session, actor: User, supplier_id: int) -> SupplierDetail:
    supplier = _get_supplier(db, actor, supplier_id)
    orders = list(db.scalars(select(PurchaseOrder).options(selectinload(PurchaseOrder.items)).where(PurchaseOrder.supplier_id == supplier.id)))
    item_ids = [i.id for o in orders for i in o.items]
    received = _received_by_item(db, item_ids)
    last_receipt = dict(
        db.execute(
            select(PurchaseOrderItem.purchase_order_id, func.max(StockMovement.created_at))
            .join(PurchaseOrderItem, PurchaseOrderItem.id == StockMovement.purchase_item_id)
            .where(StockMovement.purchase_item_id.in_(item_ids))
            .group_by(PurchaseOrderItem.purchase_order_id)
        ).all()
    ) if item_ids else {}
    today = date.today()
    received_value = open_value = Decimal(0)
    on_time = graded = 0
    lead_days: list[float] = []
    for o in orders:
        for i in o.items:
            got = received.get(i.id, Decimal(0))
            received_value += got * i.unit_price
            if o.status in OPEN:
                open_value += max(_q(i.quantity) - got, Decimal(0)) * i.unit_price
        last = last_receipt.get(o.id)
        if o.status == PurchaseStatus.RECEIVED and last is not None:
            if o.expected_date is not None:
                graded += 1
                on_time += last.date() <= o.expected_date
            if o.ordered_at is not None:
                lead_days.append(max((last.replace(tzinfo=None) - o.ordered_at.replace(tzinfo=None)).total_seconds() / 86400, 0))
    stats = SupplierStats(
        orders_total=sum(1 for o in orders if o.status != PurchaseStatus.CANCELLED),
        open_orders=sum(1 for o in orders if o.status in OPEN),
        overdue_orders=sum(1 for o in orders if _is_overdue(o, today)),
        received_value=round(float(received_value), 2),
        open_value=round(float(open_value), 2),
        on_time_pct=round(on_time / graded * 100, 1) if graded else None,
        avg_lead_days=round(sum(lead_days) / len(lead_days), 1) if lead_days else None,
    )
    base = _supplier_out(supplier, {supplier.id: stats.open_orders}, {supplier.id: stats.received_value})
    return SupplierDetail(**base.model_dump(), stats=stats)


def create_supplier(db: Session, actor: User, data: SupplierCreate) -> SupplierDetail:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    code = data.code or next_number(db, Supplier.code, Supplier.factory_id, factory_id, "SUP-", 5)
    _supplier_code_free(db, factory_id, code)
    supplier = Supplier(factory_id=factory_id, **data.model_dump(exclude={"factory_id", "code"}), code=code)
    db.add(supplier)
    db.flush()
    audit_service.record(db, actor, entity="supplier", entity_id=supplier.id, action=AuditAction.CREATE,
                         summary=f"Yetkazib beruvchi qo'shildi: {code} — {supplier.name}", factory_id=factory_id)
    db.commit()
    return get_supplier(db, actor, supplier.id)


_SUPPLIER_REQUIRED = {"name", "code", "is_active"}


def update_supplier(db: Session, actor: User, supplier_id: int, data: SupplierUpdate) -> SupplierDetail:
    supplier = _get_supplier(db, actor, supplier_id)
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k not in _SUPPLIER_REQUIRED}
    if values.get("code"):
        _supplier_code_free(db, supplier.factory_id, values["code"], exclude_id=supplier.id)
    changes = audit_service.diff(supplier, values)
    for field, value in values.items():
        setattr(supplier, field, value)
    if changes:
        audit_service.record(db, actor, entity="supplier", entity_id=supplier.id, action=AuditAction.UPDATE,
                             summary=f"Yetkazib beruvchi o'zgartirildi: {supplier.code}", factory_id=supplier.factory_id, changes=changes)
    db.commit()
    return get_supplier(db, actor, supplier.id)


def delete_supplier(db: Session, actor: User, supplier_id: int) -> None:
    supplier = _get_supplier(db, actor, supplier_id)
    if db.scalar(select(PurchaseOrder.id).where(PurchaseOrder.supplier_id == supplier.id).limit(1)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yetkazib beruvchida xarid buyurtmalari bor — o'chirish o'rniga nofaol qiling")
    audit_service.record(db, actor, entity="supplier", entity_id=supplier.id, action=AuditAction.DELETE,
                         summary=f"Yetkazib beruvchi o'chirildi: {supplier.code} — {supplier.name}", factory_id=supplier.factory_id)
    db.delete(supplier)
    db.commit()


def _is_overdue(po: PurchaseOrder, today: date | None = None) -> bool:
    return po.status in OPEN and po.expected_date is not None and po.expected_date < (today or date.today())


_PO_OPTS = (
    selectinload(PurchaseOrder.supplier),
    selectinload(PurchaseOrder.order),
    selectinload(PurchaseOrder.items).selectinload(PurchaseOrderItem.material),
)


def _load(db: Session, actor: User, po_id: int) -> PurchaseOrder:
    po = db.scalar(select(PurchaseOrder).options(*_PO_OPTS).where(PurchaseOrder.id == po_id))
    if po is None or not can_access(actor, po.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Xarid buyurtmasi topilmadi")
    return po


def _po_out(po: PurchaseOrder, received: dict[int, Decimal], creators: dict[int, str]) -> PurchaseOrderOut:
    total = sum((_q(i.quantity) * i.unit_price for i in po.items), Decimal(0))
    got = sum((min(received.get(i.id, Decimal(0)), _q(i.quantity)) * i.unit_price for i in po.items), Decimal(0))
    qty = sum((_q(i.quantity) for i in po.items), Decimal(0))
    qty_got = sum((min(received.get(i.id, Decimal(0)), _q(i.quantity)) for i in po.items), Decimal(0))
    return PurchaseOrderOut(
        id=po.id, factory_id=po.factory_id, number=po.number,
        supplier=Ref(id=po.supplier.id, code=po.supplier.code, name=po.supplier.name),
        status=po.status, order_date=po.order_date, expected_date=po.expected_date,
        order_id=po.order_id, order_number=po.order.order_number if po.order else None,
        currency=po.currency, notes=po.notes, ordered_at=po.ordered_at, closed_at=po.closed_at, created_at=po.created_at,
        created_by_name=creators.get(po.created_by_id) if po.created_by_id else None,
        items_count=len(po.items), total_amount=round(float(total), 2), received_amount=round(float(got), 2),
        received_pct=round(float(qty_got / qty * 100), 1) if qty else 0, is_overdue=_is_overdue(po),
    )


def _creators(db: Session, pos: list[PurchaseOrder]) -> dict[int, str]:
    ids = {p.created_by_id for p in pos if p.created_by_id}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


def list_purchase_orders(
    db: Session, actor: User, *, status_: PurchaseStatus | None = None, supplier_id: int | None = None,
    order_id: int | None = None, overdue: bool = False, open_only: bool = False, search: str | None = None,
    factory_id: int | None = None, offset: int = 0, limit: int = 25,
) -> PurchaseOrderPage:
    query = scoped(select(PurchaseOrder).join(Supplier, Supplier.id == PurchaseOrder.supplier_id), actor, PurchaseOrder.factory_id, factory_id)
    if status_ is not None:
        query = query.where(PurchaseOrder.status == status_)
    if open_only:
        query = query.where(PurchaseOrder.status.in_(OPEN))
    if supplier_id is not None:
        query = query.where(PurchaseOrder.supplier_id == supplier_id)
    if order_id is not None:
        query = query.where(PurchaseOrder.order_id == order_id)
    if overdue:
        query = query.where(PurchaseOrder.status.in_(OPEN), PurchaseOrder.expected_date < date.today())
    if search:
        pattern = f"%{search.strip()}%"
        mat = select(PurchaseOrderItem.purchase_order_id).join(Material, Material.id == PurchaseOrderItem.material_id).where(
            or_(Material.name.ilike(pattern), Material.code.ilike(pattern))
        )
        query = query.where(or_(PurchaseOrder.number.ilike(pattern), Supplier.name.ilike(pattern), PurchaseOrder.id.in_(mat)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    pos = list(db.scalars(query.options(*_PO_OPTS).order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id.desc()).offset(offset).limit(limit)))
    received = _received_by_item(db, [i.id for p in pos for i in p.items])
    creators = _creators(db, pos)
    return PurchaseOrderPage(items=[_po_out(p, received, creators) for p in pos], total=total)


def get_purchase_order(db: Session, actor: User, po_id: int) -> PurchaseOrderDetail:
    po = _load(db, actor, po_id)
    item_ids = [i.id for i in po.items]
    received = _received_by_item(db, item_ids)
    lines = []
    for i in po.items:
        qty, got = _q(i.quantity), received.get(i.id, Decimal(0))
        lines.append(
            PurchaseLineOut(
                id=i.id, material=Ref(id=i.material.id, code=i.material.code, name=i.material.name),
                material_type=i.material.material_type, unit=i.material.unit, quantity=float(qty),
                unit_price=float(i.unit_price), amount=round(float(qty * i.unit_price), 2),
                received=float(got), remaining=float(max(qty - got, Decimal(0))), note=i.note,
            )
        )
    receipts = []
    if item_ids:
        movements = db.scalars(
            select(StockMovement)
            .options(selectinload(StockMovement.material), selectinload(StockMovement.location), selectinload(StockMovement.created_by))
            .where(StockMovement.purchase_item_id.in_(item_ids))
            .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        )
        receipts = [inventory_service._movement_out(m) for m in movements]
    base = _po_out(po, received, _creators(db, [po]))
    return PurchaseOrderDetail(**base.model_dump(), lines=lines, receipts=receipts)


def _check_order_link(db: Session, order_id: int | None, factory_id: int) -> None:
    if order_id is None:
        return
    order = db.get(Order, order_id)
    if order is None or order.factory_id != factory_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Buyurtma topilmadi")


def _active_supplier(db: Session, actor: User, supplier_id: int, factory_id: int) -> Supplier:
    supplier = _get_supplier(db, actor, supplier_id)
    if supplier.factory_id != factory_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Yetkazib beruvchi boshqa fabrikaga tegishli")
    if not supplier.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Yetkazib beruvchi nofaol")
    return supplier


def _build_items(db: Session, factory_id: int, lines: list[PurchaseLineIn]) -> list[PurchaseOrderItem]:
    ids = {line.material_id for line in lines}
    if len(ids) != len(lines):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bir material ikki marta kiritilgan — miqdorini birlashtiring")
    materials = {m.id: m for m in db.scalars(select(Material).where(Material.id.in_(ids)))}
    items = []
    for line in lines:
        m = materials.get(line.material_id)
        if m is None or m.factory_id != factory_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Material topilmadi")
        if not m.is_active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("{code}: material nofaol", code=m.code))
        items.append(
            PurchaseOrderItem(material_id=m.id, quantity=_q(line.quantity), unit_price=Decimal(str(line.unit_price)).quantize(Decimal("0.01")), note=line.note)
        )
    return items


def create_purchase_order(db: Session, actor: User, data: PurchaseOrderCreate) -> PurchaseOrderDetail:
    supplier = _get_supplier(db, actor, data.supplier_id)
    factory_id = supplier.factory_id
    _active_supplier(db, actor, supplier.id, factory_id)
    _check_order_link(db, data.order_id, factory_id)
    order_date = data.order_date or date.today()
    if data.expected_date and data.expected_date < order_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Kutilgan sana buyurtma sanasidan oldin bo'lmasin")
    expected = data.expected_date
    if expected is None and supplier.lead_time_days is not None:
        expected = order_date + timedelta(days=supplier.lead_time_days)
    po = PurchaseOrder(
        factory_id=factory_id, number=next_number(db, PurchaseOrder.number, PurchaseOrder.factory_id, factory_id, "PO-"),
        supplier_id=supplier.id, status=PurchaseStatus.DRAFT, order_date=order_date, expected_date=expected,
        order_id=data.order_id, currency=data.currency, notes=data.notes, created_by_id=actor.id,
        items=_build_items(db, factory_id, data.items),
    )
    db.add(po)
    db.flush()
    audit_service.record(db, actor, entity="purchase_order", entity_id=po.id, action=AuditAction.CREATE,
                         summary=f"Xarid buyurtmasi {po.number}: {supplier.name}, {len(po.items)} qator", factory_id=factory_id)
    db.commit()
    return get_purchase_order(db, actor, po.id)


def update_purchase_order(db: Session, actor: User, po_id: int, data: PurchaseOrderUpdate) -> PurchaseOrderDetail:
    po = _load(db, actor, po_id)
    values = data.model_dump(exclude_unset=True)
    if po.status in (PurchaseStatus.RECEIVED, PurchaseStatus.CLOSED, PurchaseStatus.CANCELLED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Yopilgan xarid buyurtmasini o'zgartirib bo'lmaydi")
    draft_only = {"supplier_id", "order_date", "currency", "items"} & {k for k, v in values.items() if v is not None}
    if po.status != PurchaseStatus.DRAFT and draft_only:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yuborilgan buyurtmada faqat kutilgan sana va izoh o'zgaradi")
    items = values.pop("items", None)
    for key in ("supplier_id", "order_date", "currency"):
        if values.get(key, 0) is None:
            values.pop(key)
    if "supplier_id" in values:
        _active_supplier(db, actor, values["supplier_id"], po.factory_id)
    if "order_id" in values:
        _check_order_link(db, values["order_id"], po.factory_id)
    order_date = values.get("order_date", po.order_date)
    expected = values.get("expected_date", po.expected_date)
    if expected is not None and expected < order_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Kutilgan sana buyurtma sanasidan oldin bo'lmasin")
    changes = audit_service.diff(po, values)
    for field, value in values.items():
        setattr(po, field, value)
    if items is not None:
        po.items = _build_items(db, po.factory_id, [PurchaseLineIn(**i) for i in items])
        changes["items"] = [None, len(items)]
    if changes:
        audit_service.record(db, actor, entity="purchase_order", entity_id=po.id, action=AuditAction.UPDATE,
                             summary=f"Xarid buyurtmasi o'zgartirildi: {po.number}", factory_id=po.factory_id, changes=changes)
    db.commit()
    db.expire(po)
    return get_purchase_order(db, actor, po.id)


def _set_status(db: Session, actor: User, po: PurchaseOrder, new: PurchaseStatus, why: str | None = None) -> None:
    audit_service.record(db, actor, entity="purchase_order", entity_id=po.id, action=AuditAction.STATUS,
                         summary=f"Xarid buyurtmasi {po.number}: {STATUS_LABELS[new]}" + (f" ({why})" if why else ""),
                         factory_id=po.factory_id, changes={"status": [po.status.value, new.value]})
    po.status = new


def submit(db: Session, actor: User, po_id: int) -> PurchaseOrderDetail:
    po = _load(db, actor, po_id)
    if po.status != PurchaseStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Faqat qoralama yuboriladi")
    _active_supplier(db, actor, po.supplier_id, po.factory_id)
    _set_status(db, actor, po, PurchaseStatus.ORDERED)
    po.ordered_at = _now()
    db.commit()
    return get_purchase_order(db, actor, po.id)


def receive(db: Session, actor: User, po_id: int, data: ReceiveRequest) -> PurchaseOrderDetail:
    """Kelgan tovarni omborga kirim qilish — barcha qatorlar bitta tranzaksiyada."""
    po = _load(db, actor, po_id)
    if db.bind.dialect.name == "postgresql":
        db.execute(select(PurchaseOrder.id).where(PurchaseOrder.id == po.id).with_for_update())
    if po.status not in OPEN:
        raise HTTPException(status.HTTP_409_CONFLICT, "Qabul qilish uchun buyurtma yuborilgan bo'lishi kerak")
    location = db.get(WarehouseLocation, data.location_id)
    if location is None or location.factory_id != po.factory_id or not location.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ombor joyi topilmadi yoki nofaol")
    items = {i.id: i for i in po.items}
    if len({line.item_id for line in data.lines}) != len(data.lines):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bir qator ikki marta kiritilgan")
    received = _received_by_item(db, list(items))
    try:
        for line in data.lines:
            item = items.get(line.item_id)
            if item is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Qator bu buyurtmaga tegishli emas")
            qty = _q(line.quantity)
            left = _q(item.quantity) - received.get(item.id, Decimal(0))
            if qty > left:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    t("{code}: ko'pi bilan {left} qabul qilinadi (buyurtmada qolgani)", code=item.material.code, left=f"{max(left, Decimal(0)).normalize():f}"),
                )
            inventory_service.create_movement(
                db, actor,
                MovementCreate(
                    movement_type=MovementInput.RECEIPT, material_id=item.material_id, location_id=location.id,
                    quantity=float(qty), unit_cost=float(item.unit_price), document_no=data.document_no or po.number,
                    note=f"{po.number} · {po.supplier.name}" + (f" — {data.note}" if data.note else ""),
                ),
                commit=False, purchase_item_id=item.id,
            )
        db.flush()
        received = _received_by_item(db, list(items))
        complete = all(received.get(i.id, Decimal(0)) >= _q(i.quantity) for i in po.items)
        new = PurchaseStatus.RECEIVED if complete else PurchaseStatus.PARTIAL
        if new != po.status:
            _set_status(db, actor, po, new)
        if complete:
            po.closed_at = _now()
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_purchase_order(db, actor, po.id)


def close(db: Session, actor: User, po_id: int, reason: str | None = None) -> PurchaseOrderDetail:
    po = _load(db, actor, po_id)
    if po.status != PurchaseStatus.PARTIAL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Faqat qisman qabul qilingan buyurtma yopiladi (hech narsa kelmagan bo'lsa — bekor qiling)")
    _set_status(db, actor, po, PurchaseStatus.CLOSED, reason or "qolgani kelmaydi")
    po.closed_at = _now()
    db.commit()
    return get_purchase_order(db, actor, po.id)


def cancel(db: Session, actor: User, po_id: int, reason: str | None = None) -> PurchaseOrderDetail:
    po = _load(db, actor, po_id)
    if po.status not in (PurchaseStatus.DRAFT, PurchaseStatus.ORDERED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Tovar qabul qilingan buyurtma bekor qilinmaydi — yopish mumkin")
    _set_status(db, actor, po, PurchaseStatus.CANCELLED, reason)
    po.closed_at = _now()
    db.commit()
    return get_purchase_order(db, actor, po.id)


def delete_purchase_order(db: Session, actor: User, po_id: int) -> None:
    po = _load(db, actor, po_id)
    if po.status != PurchaseStatus.DRAFT:
        raise HTTPException(status.HTTP_409_CONFLICT, "Faqat qoralama o'chiriladi — yuborilganini bekor qiling")
    audit_service.record(db, actor, entity="purchase_order", entity_id=po.id, action=AuditAction.DELETE,
                         summary=f"Xarid buyurtmasi o'chirildi: {po.number}", factory_id=po.factory_id)
    db.delete(po)
    db.commit()


def on_order_by_material(db: Session, material_ids: set[int]) -> dict[int, Decimal]:
    """Yo'ldagi (yuborilgan, hali kelmagan) miqdor — material ehtiyoji hisobida ko'rsatiladi."""
    if not material_ids:
        return {}
    items = db.execute(
        select(PurchaseOrderItem.id, PurchaseOrderItem.material_id, PurchaseOrderItem.quantity)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(PurchaseOrderItem.material_id.in_(material_ids), PurchaseOrder.status.in_(OPEN))
    ).all()
    received = _received_by_item(db, [i for i, _, _ in items])
    result: dict[int, Decimal] = defaultdict(Decimal)
    for item_id, material_id, qty in items:
        result[material_id] += max(_q(qty) - received.get(item_id, Decimal(0)), Decimal(0))
    return result


def summary(db: Session, actor: User, factory_id: int | None = None) -> ProcurementSummary:
    today = date.today()
    pos = list(db.scalars(scoped(select(PurchaseOrder).options(selectinload(PurchaseOrder.items)), actor, PurchaseOrder.factory_id, factory_id)
                         .where(PurchaseOrder.status.in_(OPEN + (PurchaseStatus.DRAFT,)))))
    open_pos = [p for p in pos if p.status in OPEN]
    received = _received_by_item(db, [i.id for p in open_pos for i in p.items])
    open_value = sum(
        (max(_q(i.quantity) - received.get(i.id, Decimal(0)), Decimal(0)) * i.unit_price for p in open_pos for i in p.items), Decimal(0)
    )
    suppliers = db.scalar(select(func.count()).select_from(
        scoped(select(Supplier.id).where(Supplier.is_active.is_(True)), actor, Supplier.factory_id, factory_id).subquery()
    )) or 0
    return ProcurementSummary(
        suppliers_count=suppliers,
        open_orders=len(open_pos),
        overdue_orders=sum(1 for p in open_pos if _is_overdue(p, today)),
        drafts=sum(1 for p in pos if p.status == PurchaseStatus.DRAFT),
        open_value=round(float(open_value), 2),
        expected_7d=sum(1 for p in open_pos if p.expected_date is not None and today <= p.expected_date <= today + timedelta(days=7)),
    )
