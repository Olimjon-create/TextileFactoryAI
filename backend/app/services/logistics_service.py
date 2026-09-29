"""Tayyor mahsulot ombori va jo'natmalar.

Qoidalar:
  - qoldiq = Σ product_stock_movements.quantity (mahsulot + o'lcham + rang + joy); alohida saqlanmaydi;
  - omborga qabul — ish buyurtmasi bo'yicha, qadoqlangan miqdordan oshmaydi (ishlab chiqarish yozuvlaridan);
  - jo'natma buyurtma qatorlariga bog'lanadi: buyurtmadagidan ko'p jo'natilmaydi;
    ombordan chiqim "Yo'lga chiqdi" paytida (tayyorlanayotganda qoldiq o'zgarmaydi);
  - buyurtma holati avtomatik: hammasi jo'natilsa → "Jo'natildi"; hammasi yetkazilsa va to'langan bo'lsa → "Yakunlandi".
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.core.numbering import next_number
from app.core.roles import Role
from app.core.scope import can_access, scoped
from app.models import (
    Order,
    OrderItem,
    Product,
    ProductMovementType,
    ProductStockMovement,
    Shipment,
    ShipmentItem,
    ShipmentStatus,
    User,
    WarehouseLocation,
    WorkOrder,
)
from app.models.audit import AuditAction
from app.models.order import OrderStatus
from app.models.resources import ProductionStage
from app.schemas.logistics import (
    DeliverRequest,
    FgMovementCreate,
    FgMovementInput,
    FgMovementOut,
    FgMovementPage,
    FgSummary,
    LocationQty,
    OrderShipping,
    OrderShippingLine,
    ProductionReceiptCreate,
    Ref,
    ShipmentCreate,
    ShipmentDetail,
    ShipmentLineIn,
    ShipmentLineOut,
    ShipmentOut,
    ShipmentPage,
    ShipmentUpdate,
    ShipRequest,
    StockPage,
    StockRow,
    WorkOrderStock,
)
from app.services import audit_service, inventory_service, order_service, production_service
from app.core.i18n import t

LOGISTICS_VIEW_ROLES = inventory_service.INVENTORY_VIEW_ROLES
LOGISTICS_EDITOR_ROLES = inventory_service.INVENTORY_EDITOR_ROLES
FG_RECEIVE_ROLES = LOGISTICS_EDITOR_ROLES + (Role.PRODUCTION_MANAGER,)

MOVEMENT_LABELS = {
    ProductMovementType.PRODUCTION: "Ishlab chiqarishdan qabul",
    ProductMovementType.SHIPMENT: "Jo'natildi",
    ProductMovementType.RETURN: "Mijozdan qaytdi",
    ProductMovementType.WRITE_OFF: "Hisobdan chiqarildi",
    ProductMovementType.ADJUSTMENT: "Inventarizatsiya",
    ProductMovementType.RECEIPT: "Kirim",
    ProductMovementType.TRANSFER_OUT: "Boshqa joyga ko'chirildi",
    ProductMovementType.TRANSFER_IN: "Boshqa joydan keldi",
}
STATUS_LABELS = {
    ShipmentStatus.PREPARING: "Tayyorlanmoqda",
    ShipmentStatus.SHIPPED: "Yo'lga chiqdi",
    ShipmentStatus.DELIVERED: "Yetkazildi",
    ShipmentStatus.CANCELLED: "Bekor qilindi",
}
NO_SHIP_ORDER = (OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED, OrderStatus.COMPLETED)
PRE_SHIP_ORDER = (OrderStatus.NEW, OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION, OrderStatus.READY)

PSM = ProductStockMovement
Key = tuple[int, str | None, str | None]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _variant_label(size: str | None, color: str | None) -> str:
    return " · ".join(v for v in (size, color) if v)


def _variant_cond(size: str | None, color: str | None):
    return and_(
        PSM.size.is_(None) if size is None else PSM.size == size,
        PSM.color.is_(None) if color is None else PSM.color == color,
    )


def _lock_product(db: Session, product_id: int) -> None:
    """Bir mahsulot bo'yicha bir vaqtdagi chiqimlar qoldiqni manfiyga tushirmasin (PostgreSQL)."""
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": 800_000_000 + product_id})


def _balance(db: Session, product_id: int, size: str | None, color: str | None, location_id: int) -> int:
    return int(
        db.scalar(
            select(func.coalesce(func.sum(PSM.quantity), 0)).where(
                PSM.product_id == product_id, PSM.location_id == location_id, _variant_cond(size, color)
            )
        )
        or 0
    )


def _variant_stock(db: Session, keys: set[Key]) -> dict[Key, int]:
    if not keys:
        return {}
    rows = db.execute(
        select(PSM.product_id, PSM.size, PSM.color, func.sum(PSM.quantity))
        .where(PSM.product_id.in_({k[0] for k in keys}))
        .group_by(PSM.product_id, PSM.size, PSM.color)
    )
    return {(p, s, c): int(q or 0) for p, s, c, q in rows if (p, s, c) in keys}


def _locations_with_stock(db: Session, product_id: int, size: str | None, color: str | None) -> list[tuple[WarehouseLocation, int]]:
    rows = db.execute(
        select(WarehouseLocation, func.sum(PSM.quantity))
        .join(PSM, PSM.location_id == WarehouseLocation.id)
        .where(PSM.product_id == product_id, _variant_cond(size, color), WarehouseLocation.is_active.is_(True))
        .group_by(WarehouseLocation.id)
    ).all()
    return sorted(((loc, int(q)) for loc, q in rows if q and q > 0), key=lambda x: x[1], reverse=True)


def _get_location(db: Session, factory_id: int, location_id: int) -> WarehouseLocation:
    location = db.get(WarehouseLocation, location_id)
    if location is None or location.factory_id != factory_id or not location.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ombor joyi topilmadi yoki nofaol")
    return location


def _get_product(db: Session, actor: User, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None or not can_access(actor, product.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mahsulot topilmadi")
    return product


def _post(
    db: Session, actor: User, *, product: Product, size: str | None, color: str | None, location: WarehouseLocation,
    kind: ProductMovementType, qty: int, work_order_id: int | None = None, shipment_id: int | None = None,
    order_id: int | None = None, note: str | None = None,
) -> ProductStockMovement:
    """Bitta harakat (commit'siz). Chiqimda joydagi qoldiq tekshiriladi."""
    if qty < 0:
        _lock_product(db, product.id)
        balance = _balance(db, product.id, size, color, location.id)
        if -qty > balance:
            variant = _variant_label(size, color)
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                t("«{location}» joyida {product} yetarli emas: bor {balance} dona", location=location.name, product=product.code + (f" ({variant})" if variant else ""), balance=balance),
            )
    movement = PSM(
        factory_id=product.factory_id, product_id=product.id, size=size, color=color, location_id=location.id,
        movement_type=kind, quantity=qty, work_order_id=work_order_id, shipment_id=shipment_id, order_id=order_id,
        note=note, created_by_id=actor.id,
    )
    db.add(movement)
    db.flush()
    return movement


def list_stock(
    db: Session, actor: User, *, search: str | None = None, location_id: int | None = None, product_id: int | None = None,
    factory_id: int | None = None, offset: int = 0, limit: int = 25,
) -> StockPage:
    grouped = scoped(
        select(PSM.product_id, PSM.size, PSM.color, func.sum(PSM.quantity).label("qty")).group_by(PSM.product_id, PSM.size, PSM.color),
        actor, PSM.factory_id, factory_id,
    )
    if location_id is not None:
        grouped = grouped.where(PSM.location_id == location_id)
    if product_id is not None:
        grouped = grouped.where(PSM.product_id == product_id)
    sub = grouped.subquery()
    query = select(sub.c.product_id, sub.c.size, sub.c.color, sub.c.qty, Product).join(Product, Product.id == sub.c.product_id).where(sub.c.qty != 0)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Product.name.ilike(pattern), Product.code.ilike(pattern), sub.c.size.ilike(pattern), sub.c.color.ilike(pattern)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(Product.name, sub.c.size, sub.c.color).offset(offset).limit(limit)).all()

    by_location: dict[Key, list[LocationQty]] = defaultdict(list)
    if rows:
        loc_query = (
            select(PSM.product_id, PSM.size, PSM.color, WarehouseLocation, func.sum(PSM.quantity))
            .join(WarehouseLocation, WarehouseLocation.id == PSM.location_id)
            .where(PSM.product_id.in_({r.product_id for r in rows}))
            .group_by(PSM.product_id, PSM.size, PSM.color, WarehouseLocation.id)
            .order_by(WarehouseLocation.code)
        )
        if location_id is not None:
            loc_query = loc_query.where(PSM.location_id == location_id)
        for p, s, c, loc, q in db.execute(loc_query):
            if q:
                by_location[(p, s, c)].append(LocationQty(location=Ref(id=loc.id, code=loc.code, name=loc.name), quantity=int(q)))
    items = []
    for r in rows:
        price = float(r.Product.price) if r.Product.price is not None else None
        qty = int(r.qty)
        items.append(
            StockRow(
                product=Ref(id=r.Product.id, code=r.Product.code, name=r.Product.name), size=r.size, color=r.color,
                quantity=qty, locations=by_location.get((r.product_id, r.size, r.color), []),
                unit_price=price, value=round(price * qty, 2) if price is not None else None,
            )
        )
    return StockPage(items=items, total=total)


def _movement_out(m: PSM, wo_number: str | None, sh_number: str | None, order_number: str | None) -> FgMovementOut:
    return FgMovementOut(
        id=m.id, movement_type=m.movement_type, quantity=m.quantity,
        product=Ref(id=m.product.id, code=m.product.code, name=m.product.name), size=m.size, color=m.color,
        location=Ref(id=m.location.id, code=m.location.code, name=m.location.name),
        work_order_id=m.work_order_id, work_order_number=wo_number, shipment_id=m.shipment_id, shipment_number=sh_number,
        order_id=m.order_id, order_number=order_number, note=m.note,
        created_by_name=m.created_by.full_name if m.created_by else None, created_at=m.created_at,
    )


def _movements_query():
    return (
        select(PSM, WorkOrder.number, Shipment.number, Order.order_number)
        .join(Product, Product.id == PSM.product_id)
        .outerjoin(WorkOrder, WorkOrder.id == PSM.work_order_id)
        .outerjoin(Shipment, Shipment.id == PSM.shipment_id)
        .outerjoin(Order, Order.id == PSM.order_id)
        .options(selectinload(PSM.product), selectinload(PSM.location), selectinload(PSM.created_by))
    )


def list_movements(
    db: Session, actor: User, *, movement_type: ProductMovementType | None = None, product_id: int | None = None,
    location_id: int | None = None, work_order_id: int | None = None, shipment_id: int | None = None,
    order_id: int | None = None, search: str | None = None, date_from: date | None = None, date_to: date | None = None,
    factory_id: int | None = None, offset: int = 0, limit: int = 25,
) -> FgMovementPage:
    query = scoped(_movements_query(), actor, PSM.factory_id, factory_id)
    for column, value in ((PSM.movement_type, movement_type), (PSM.product_id, product_id), (PSM.location_id, location_id),
                          (PSM.work_order_id, work_order_id), (PSM.shipment_id, shipment_id), (PSM.order_id, order_id)):
        if value is not None:
            query = query.where(column == value)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Product.name.ilike(pattern), Product.code.ilike(pattern), PSM.note.ilike(pattern),
                                WorkOrder.number.ilike(pattern), Shipment.number.ilike(pattern), Order.order_number.ilike(pattern)))
    if date_from:
        query = query.where(PSM.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.where(PSM.created_at < datetime.combine(date_to + timedelta(days=1), time.min))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(PSM.created_at.desc(), PSM.id.desc()).offset(offset).limit(limit)).all()
    return FgMovementPage(items=[_movement_out(*r) for r in rows], total=total)


def _one_movement(db: Session, movement_id: int) -> FgMovementOut:
    return _movement_out(*db.execute(_movements_query().where(PSM.id == movement_id)).one())


def create_movement(db: Session, actor: User, data: FgMovementCreate) -> FgMovementOut:
    """Qo'lda: kirim, mijozdan qaytish, hisobdan chiqarish, joydan joyga ko'chirish yoki inventarizatsiya."""
    product = _get_product(db, actor, data.product_id)
    location = _get_location(db, product.factory_id, data.location_id)
    if data.movement_type == FgMovementInput.TRANSFER:
        return _transfer(db, actor, product, location, data)
    has_history = db.scalar(select(PSM.id).where(PSM.product_id == product.id, _variant_cond(data.size, data.color)).limit(1))
    if has_history is None:
        order_service._check_variant(product, data.size, data.color)
    if data.order_id is not None:
        order = db.get(Order, data.order_id)
        if order is None or order.factory_id != product.factory_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Buyurtma topilmadi")
    kind = data.movement_type
    if kind != FgMovementInput.ADJUSTMENT and data.quantity <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Miqdor 0 dan katta bo'lsin")
    _lock_product(db, product.id)
    balance = _balance(db, product.id, data.size, data.color, location.id)
    if kind == FgMovementInput.RECEIPT:
        qty, movement_type = data.quantity, ProductMovementType.RECEIPT
    elif kind == FgMovementInput.RETURN:
        qty, movement_type = data.quantity, ProductMovementType.RETURN
    elif kind == FgMovementInput.WRITE_OFF:
        qty, movement_type = -data.quantity, ProductMovementType.WRITE_OFF
    else:
        qty, movement_type = data.quantity - balance, ProductMovementType.ADJUSTMENT
        if qty == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sanoq natijasi joriy qoldiq bilan bir xil — tuzatish kerak emas")
    movement = _post(db, actor, product=product, size=data.size, color=data.color, location=location, kind=movement_type,
                     qty=qty, order_id=data.order_id, note=data.note)
    variant = _variant_label(data.size, data.color)
    audit_service.record(
        db, actor, entity="product_stock", entity_id=movement.id, action=AuditAction.STOCK,
        summary=f"{MOVEMENT_LABELS[movement_type]}: {product.code}{f' ({variant})' if variant else ''} {qty:+d} dona ({location.code})",
        factory_id=product.factory_id,
        changes={"product_id": product.id, "location_id": location.id, "quantity": qty, "balance_before": balance},
    )
    db.commit()
    return _one_movement(db, movement.id)


def _transfer(db: Session, actor: User, product: Product, source: WarehouseLocation, data: FgMovementCreate) -> FgMovementOut:
    """Bir joydan boshqasiga: chiqim (−) va kirim (+) bitta tranzaksiyada; umumiy qoldiq o'zgarmaydi."""
    if data.to_location_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Qaysi joyga ko'chirilishini tanlang")
    target = _get_location(db, product.factory_id, data.to_location_id)
    if target.id == source.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Qayerdan va qayerga — har xil joy bo'lsin")
    if data.quantity <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Miqdor 0 dan katta bo'lsin")
    common = {"product": product, "size": data.size, "color": data.color, "note": data.note}
    out = _post(db, actor, location=source, kind=ProductMovementType.TRANSFER_OUT, qty=-data.quantity, **common)
    _post(db, actor, location=target, kind=ProductMovementType.TRANSFER_IN, qty=data.quantity, **common)
    variant = _variant_label(data.size, data.color)
    audit_service.record(
        db, actor, entity="product_stock", entity_id=out.id, action=AuditAction.STOCK,
        summary=f"Ko'chirildi: {product.code}{f' ({variant})' if variant else ''} {data.quantity} dona ({source.code} → {target.code})",
        factory_id=product.factory_id,
        changes={"product_id": product.id, "from_location_id": source.id, "to_location_id": target.id, "quantity": data.quantity},
    )
    db.commit()
    return _one_movement(db, out.id)


def _received_from_wo(db: Session, wo_id: int) -> int:
    return int(db.scalar(
        select(func.coalesce(func.sum(PSM.quantity), 0)).where(PSM.work_order_id == wo_id, PSM.movement_type == ProductMovementType.PRODUCTION)
    ) or 0)


def _wo_stock(db: Session, wo: WorkOrder) -> WorkOrderStock:
    packed = production_service._totals(db, [wo.id])[wo.id].get(ProductionStage.PACKING, (0, 0))[0]
    received = _received_from_wo(db, wo.id)
    return WorkOrderStock(work_order_id=wo.id, packed=packed, received=received, remaining=max(packed - received, 0))


def work_order_stock(db: Session, actor: User, wo_id: int) -> WorkOrderStock:
    return _wo_stock(db, production_service._load(db, actor, wo_id))


def receive_from_work_order(db: Session, actor: User, data: ProductionReceiptCreate) -> WorkOrderStock:
    wo = production_service._load(db, actor, data.work_order_id)
    if wo.product_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ish buyurtmasidagi mahsulot katalogdan o'chirilgan")
    product = db.get(Product, wo.product_id)
    location = _get_location(db, wo.factory_id, data.location_id)
    production_service._lock_row(db, wo)
    _lock_product(db, product.id)
    stock = _wo_stock(db, wo)
    if data.quantity > stock.remaining:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            t("Ko'pi bilan {remaining} dona (qadoqlangan {packed}, omborga topshirilgan {received})", remaining=stock.remaining, packed=stock.packed, received=stock.received),
        )
    movement = _post(db, actor, product=product, size=wo.size, color=wo.color, location=location, kind=ProductMovementType.PRODUCTION,
                     qty=data.quantity, work_order_id=wo.id, order_id=wo.order_id, note=data.note)
    audit_service.record(
        db, actor, entity="product_stock", entity_id=movement.id, action=AuditAction.STOCK,
        summary=f"Omborga qabul: {wo.number} → {product.code} +{data.quantity} dona ({location.code})",
        factory_id=wo.factory_id, changes={"work_order_id": wo.id, "location_id": location.id, "quantity": data.quantity},
    )
    db.commit()
    return _wo_stock(db, wo)


_SH_OPTS = (selectinload(Shipment.order), selectinload(Shipment.items).selectinload(ShipmentItem.order_item))


def _load_shipment(db: Session, actor: User, shipment_id: int) -> Shipment:
    sh = db.scalar(select(Shipment).options(*_SH_OPTS).where(Shipment.id == shipment_id))
    if sh is None or not can_access(actor, sh.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jo'natma topilmadi")
    return sh


def _creators(db: Session, ids: set[int | None]) -> dict[int, str]:
    ids = {i for i in ids if i}
    return dict(db.execute(select(User.id, User.full_name).where(User.id.in_(ids))).all()) if ids else {}


def _is_late(sh: Shipment, today: date) -> bool:
    return sh.status == ShipmentStatus.PREPARING and sh.planned_date is not None and sh.planned_date < today


def _shipment_out(sh: Shipment, creators: dict[int, str], today: date | None = None) -> ShipmentOut:
    return ShipmentOut(
        id=sh.id, factory_id=sh.factory_id, number=sh.number, order_id=sh.order_id, order_number=sh.order.order_number,
        customer_name=sh.order.customer_name, customer_phone=sh.order.customer_phone, status=sh.status,
        planned_date=sh.planned_date, delivery_address=sh.delivery_address, carrier=sh.carrier, vehicle_no=sh.vehicle_no,
        driver_name=sh.driver_name, driver_phone=sh.driver_phone, tracking_no=sh.tracking_no, shipped_at=sh.shipped_at,
        delivered_at=sh.delivered_at, received_by=sh.received_by, notes=sh.notes, created_at=sh.created_at,
        created_by_name=creators.get(sh.created_by_id) if sh.created_by_id else None,
        items_count=len(sh.items), total_quantity=sum(i.quantity for i in sh.items), is_late=_is_late(sh, today or date.today()),
    )


def _item_progress(db: Session, item_ids: list[int], exclude_shipment: int | None = None) -> dict[int, tuple[int, int]]:
    """Buyurtma qatori bo'yicha: (jo'natilgan — yo'lda/yetkazilgan, tayyorlanayotgan)."""
    if not item_ids:
        return {}
    query = (
        select(ShipmentItem.order_item_id, Shipment.status, func.sum(ShipmentItem.quantity))
        .join(Shipment, Shipment.id == ShipmentItem.shipment_id)
        .where(ShipmentItem.order_item_id.in_(item_ids), Shipment.status != ShipmentStatus.CANCELLED)
        .group_by(ShipmentItem.order_item_id, Shipment.status)
    )
    if exclude_shipment is not None:
        query = query.where(Shipment.id != exclude_shipment)
    result: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for item_id, st, qty in db.execute(query):
        result[item_id][0 if st != ShipmentStatus.PREPARING else 1] += int(qty or 0)
    return {k: (v[0], v[1]) for k, v in result.items()}


def list_shipments(
    db: Session, actor: User, *, status_: ShipmentStatus | None = None, order_id: int | None = None, late: bool = False,
    search: str | None = None, factory_id: int | None = None, offset: int = 0, limit: int = 25,
) -> ShipmentPage:
    query = scoped(select(Shipment).join(Order, Order.id == Shipment.order_id), actor, Shipment.factory_id, factory_id)
    if status_ is not None:
        query = query.where(Shipment.status == status_)
    if order_id is not None:
        query = query.where(Shipment.order_id == order_id)
    if late:
        query = query.where(Shipment.status == ShipmentStatus.PREPARING, Shipment.planned_date < date.today())
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Shipment.number.ilike(pattern), Order.order_number.ilike(pattern), Order.customer_name.ilike(pattern),
                                Shipment.tracking_no.ilike(pattern), Shipment.vehicle_no.ilike(pattern), Shipment.carrier.ilike(pattern)))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = list(db.scalars(query.options(*_SH_OPTS).order_by(Shipment.created_at.desc(), Shipment.id.desc()).offset(offset).limit(limit)))
    creators = _creators(db, {s.created_by_id for s in rows})
    today = date.today()
    return ShipmentPage(items=[_shipment_out(s, creators, today) for s in rows], total=total)


def _key(item: OrderItem) -> Key | None:
    return (item.product_id, item.size, item.color) if item.product_id is not None else None


def get_shipment(db: Session, actor: User, shipment_id: int) -> ShipmentDetail:
    sh = _load_shipment(db, actor, shipment_id)
    stock = _variant_stock(db, {k for i in sh.items if (k := _key(i.order_item))})
    lines = [
        ShipmentLineOut(
            id=i.id, order_item_id=i.order_item_id, product_id=i.order_item.product_id, product_name=i.order_item.product_name,
            product_code=i.order_item.product_code, size=i.order_item.size, color=i.order_item.color, quantity=i.quantity,
            in_stock=stock.get(_key(i.order_item), 0) if _key(i.order_item) else 0,
        )
        for i in sh.items
    ]
    return ShipmentDetail(**_shipment_out(sh, _creators(db, {sh.created_by_id})).model_dump(), lines=lines)


def _build_lines(db: Session, order: Order, lines: list[ShipmentLineIn], exclude_shipment: int | None = None) -> list[ShipmentItem]:
    items = {i.id: i for i in order.items}
    if len({line.order_item_id for line in lines}) != len(lines):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bir buyurtma qatori ikki marta kiritilgan")
    progress = _item_progress(db, list(items), exclude_shipment)
    result = []
    for line in lines:
        item = items.get(line.order_item_id)
        if item is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Buyurtma qatori topilmadi")
        shipped, preparing = progress.get(item.id, (0, 0))
        left = item.quantity - shipped - preparing
        if line.quantity > left:
            variant = _variant_label(item.size, item.color)
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                t("«{product}»: ko'pi bilan {left} dona (buyurtmada {ordered}, jo'natmalarda {shipped})", product=item.product_name + (f" ({variant})" if variant else ""), left=max(left, 0), ordered=item.quantity, shipped=shipped + preparing),
            )
        result.append(ShipmentItem(order_item_id=item.id, quantity=line.quantity))
    return result


def create_shipment(db: Session, actor: User, data: ShipmentCreate) -> ShipmentDetail:
    order = order_service._get(db, actor, data.order_id)
    if order.status in NO_SHIP_ORDER:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bekor qilingan, yakunlangan yoki to'lanmagan buyurtma jo'natilmaydi")
    values = data.model_dump(exclude={"order_id", "items"})
    values["delivery_address"] = values["delivery_address"] or order.delivery_address
    sh = Shipment(
        factory_id=order.factory_id, number=next_number(db, Shipment.number, Shipment.factory_id, order.factory_id, "SH-"),
        order_id=order.id, status=ShipmentStatus.PREPARING, created_by_id=actor.id, items=_build_lines(db, order, data.items), **values,
    )
    db.add(sh)
    db.flush()
    audit_service.record(db, actor, entity="shipment", entity_id=sh.id, action=AuditAction.CREATE,
                         summary=f"Jo'natma {sh.number}: buyurtma {order.order_number}, {sum(i.quantity for i in sh.items)} dona",
                         factory_id=order.factory_id)
    db.commit()
    return get_shipment(db, actor, sh.id)


_TRANSPORT_FIELDS = {"delivery_address", "carrier", "vehicle_no", "driver_name", "driver_phone", "tracking_no", "notes"}


def update_shipment(db: Session, actor: User, shipment_id: int, data: ShipmentUpdate) -> ShipmentDetail:
    sh = _load_shipment(db, actor, shipment_id)
    if sh.status == ShipmentStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bekor qilingan jo'natma o'zgartirilmaydi")
    values = data.model_dump(exclude_unset=True)
    items = values.pop("items", None)
    if sh.status != ShipmentStatus.PREPARING and (items is not None or set(values) - _TRANSPORT_FIELDS):
        raise HTTPException(status.HTTP_409_CONFLICT, "Yo'lga chiqqan jo'natmada faqat transport ma'lumotlari va izoh o'zgaradi")
    changes = audit_service.diff(sh, values)
    for field, value in values.items():
        setattr(sh, field, value)
    if items is not None:
        sh.items = _build_lines(db, sh.order, [ShipmentLineIn(**i) for i in items], exclude_shipment=sh.id)
        changes["items"] = [None, len(items)]
    if changes:
        audit_service.record(db, actor, entity="shipment", entity_id=sh.id, action=AuditAction.UPDATE,
                             summary=f"Jo'natma o'zgartirildi: {sh.number}", factory_id=sh.factory_id, changes=changes)
    db.commit()
    db.expire(sh)
    return get_shipment(db, actor, sh.id)


def _set_status(db: Session, actor: User, sh: Shipment, new: ShipmentStatus) -> None:
    audit_service.record(db, actor, entity="shipment", entity_id=sh.id, action=AuditAction.STATUS,
                         summary=f"Jo'natma {sh.number}: {STATUS_LABELS[new]}", factory_id=sh.factory_id,
                         changes={"status": [sh.status.value, new.value]})
    sh.status = new


def _fully_shipped(db: Session, order: Order) -> bool:
    progress = _item_progress(db, [i.id for i in order.items])
    return bool(order.items) and all(progress.get(i.id, (0, 0))[0] >= i.quantity for i in order.items)


def ship(db: Session, actor: User, shipment_id: int, data: ShipRequest) -> ShipmentDetail:
    """Yo'lga chiqarish: tayyor mahsulot omboridan chiqim (hammasi yoki hech biri)."""
    sh = _load_shipment(db, actor, shipment_id)
    if sh.status != ShipmentStatus.PREPARING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Faqat tayyorlanayotgan jo'natma yo'lga chiqariladi")
    order = sh.order
    if order.status in NO_SHIP_ORDER:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bekor qilingan yoki yakunlangan buyurtma jo'natilmaydi")
    fixed = _get_location(db, sh.factory_id, data.location_id) if data.location_id is not None else None
    try:
        for si in sh.items:
            item = si.order_item
            if item.product_id is None:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("«{product}» katalogdan o'chirilgan — ombor qoldig'i yo'q", product=item.product_name))
            product = db.get(Product, item.product_id)
            _lock_product(db, product.id)
            if fixed is not None:
                plan = [(fixed, si.quantity)]
            else:
                plan, left = [], si.quantity
                sources = _locations_with_stock(db, product.id, item.size, item.color)
                for location, available in sources:
                    take = min(available, left)
                    plan.append((location, take))
                    left -= take
                    if left == 0:
                        break
                if left > 0:
                    variant = _variant_label(item.size, item.color)
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        t("«{product}»: omborda {have} dona, kerak {need}", product=item.product_name + (f" ({variant})" if variant else ""), have=si.quantity - left, need=si.quantity),
                    )
            for location, take in plan:
                _post(db, actor, product=product, size=item.size, color=item.color, location=location, kind=ProductMovementType.SHIPMENT,
                      qty=-take, shipment_id=sh.id, order_id=order.id, note=sh.number)
        _set_status(db, actor, sh, ShipmentStatus.SHIPPED)
        sh.shipped_at = _now()
        db.flush()
        if order.status in PRE_SHIP_ORDER and _fully_shipped(db, order):
            order_service.change_status(db, actor, order, OrderStatus.SHIPPED, f"{sh.number} bilan hammasi jo'natildi")
        db.commit()
    except Exception:
        db.rollback()
        raise
    return get_shipment(db, actor, sh.id)


def deliver(db: Session, actor: User, shipment_id: int, data: DeliverRequest) -> ShipmentDetail:
    sh = _load_shipment(db, actor, shipment_id)
    if sh.status != ShipmentStatus.SHIPPED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Faqat yo'ldagi jo'natma yetkazildi deb belgilanadi")
    delivered_at = data.delivered_at or _now()
    if delivered_at.replace(tzinfo=None) > _now().replace(tzinfo=None) + timedelta(minutes=5):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Yetkazilgan vaqt kelajakda bo'lmasin")
    _set_status(db, actor, sh, ShipmentStatus.DELIVERED)
    sh.delivered_at = delivered_at
    sh.received_by = data.received_by
    db.flush()
    order_service.complete_if_done(db, actor, sh.order)
    db.commit()
    return get_shipment(db, actor, sh.id)


def cancel(db: Session, actor: User, shipment_id: int) -> ShipmentDetail:
    sh = _load_shipment(db, actor, shipment_id)
    if sh.status != ShipmentStatus.PREPARING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yo'lga chiqqan jo'natma bekor qilinmaydi — qaytgan mahsulotni «Mijozdan qaytdi» bilan kiriting")
    _set_status(db, actor, sh, ShipmentStatus.CANCELLED)
    db.commit()
    return get_shipment(db, actor, sh.id)


def order_shipping(db: Session, actor: User, order_id: int) -> OrderShipping:
    order = order_service._get(db, actor, order_id)
    progress = _item_progress(db, [i.id for i in order.items])
    stock = _variant_stock(db, {k for i in order.items if (k := _key(i))})
    lines = []
    for i in order.items:
        shipped, preparing = progress.get(i.id, (0, 0))
        lines.append(
            OrderShippingLine(
                order_item_id=i.id, product_id=i.product_id, product_name=i.product_name, product_code=i.product_code,
                size=i.size, color=i.color, ordered=i.quantity, shipped=shipped, preparing=preparing,
                remaining=max(i.quantity - shipped - preparing, 0), in_stock=stock.get(_key(i), 0) if _key(i) else 0,
            )
        )
    shipments = list(db.scalars(select(Shipment).options(*_SH_OPTS).where(Shipment.order_id == order.id).order_by(Shipment.id.desc())))
    creators = _creators(db, {s.created_by_id for s in shipments})
    return OrderShipping(
        order_id=order.id, order_status=order.status, lines=lines,
        shipments=[_shipment_out(s, creators) for s in shipments],
        fully_shipped=bool(lines) and all(line.shipped >= line.ordered for line in lines),
    )


def summary(db: Session, actor: User, factory_id: int | None = None) -> FgSummary:
    variants = scoped(
        select(PSM.product_id, func.sum(PSM.quantity).label("qty")).group_by(PSM.product_id, PSM.size, PSM.color),
        actor, PSM.factory_id, factory_id,
    ).subquery()
    skus, units, value = db.execute(
        select(func.count(), func.coalesce(func.sum(variants.c.qty), 0), func.coalesce(func.sum(variants.c.qty * func.coalesce(Product.price, 0)), 0))
        .select_from(variants).join(Product, Product.id == variants.c.product_id).where(variants.c.qty != 0)
    ).one()
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)

    def moved(*kinds: ProductMovementType) -> int:
        q = scoped(select(func.coalesce(func.sum(PSM.quantity), 0)).where(PSM.movement_type.in_(kinds), PSM.created_at >= since),
                   actor, PSM.factory_id, factory_id)
        return abs(int(db.scalar(q) or 0))

    def shipments(*conds) -> int:
        q = scoped(select(func.count()).select_from(Shipment).where(*conds), actor, Shipment.factory_id, factory_id)
        return int(db.scalar(q) or 0)

    return FgSummary(
        skus=int(skus), units=int(units), value=round(float(value), 2),
        received_30d=moved(ProductMovementType.PRODUCTION, ProductMovementType.RECEIPT), shipped_30d=moved(ProductMovementType.SHIPMENT),
        shipments_preparing=shipments(Shipment.status == ShipmentStatus.PREPARING),
        shipments_in_transit=shipments(Shipment.status == ShipmentStatus.SHIPPED),
        shipments_late=shipments(Shipment.status == ShipmentStatus.PREPARING, Shipment.planned_date < date.today()),
    )
