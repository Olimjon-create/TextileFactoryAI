"""Ombor: materiallar katalogi, joylashuvlar, harakatlar jurnali va qoldiqlar.

Qoidalar:
  - qoldiq = SUM(stock_movements.quantity) (material + joy bo'yicha); alohida saqlanmaydi;
  - chiqim joydagi qoldiqdan oshmaydi (manfiy qoldiq yo'q);
  - jurnal yozuvlari o'zgarmaydi; tuzatish — ADJUSTMENT (inventarizatsiya) orqali;
  - har bir amal audit log'ga yoziladi.
"""

import uuid
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, or_, select, text
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.core.scope import can_access, resolve_factory_id, scoped
from app.models import BOMItem, Factory, Material, MovementType, Order, PurchaseOrderItem, StockMovement, User, WarehouseLocation
from app.models.audit import AuditAction
from app.schemas.inventory import (
    InventorySummary,
    LocationCreate,
    LocationOut,
    LocationStock,
    LocationUpdate,
    MaterialCreate,
    MaterialDetail,
    MaterialOut,
    MaterialPage,
    MaterialUpdate,
    MovementCreate,
    MovementInput,
    MovementOut,
    MovementPage,
    Ref,
)
from app.services import audit_service
from app.core.i18n import t
from app.services import telegram_service

INVENTORY_VIEW_ROLES = (
    Role.SUPER_ADMIN,
    Role.FACTORY_OWNER,
    Role.MANAGER,
    Role.PRODUCTION_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.QUALITY_MANAGER,
)
INVENTORY_EDITOR_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.WAREHOUSE_MANAGER)

MOVEMENT_LABELS = {
    MovementType.RECEIPT: "Kirim",
    MovementType.ISSUE: "Ishlab chiqarishga chiqim",
    MovementType.RETURN: "Qaytarildi",
    MovementType.WRITE_OFF: "Hisobdan chiqarildi",
    MovementType.ADJUSTMENT: "Inventarizatsiya",
    MovementType.TRANSFER_OUT: "Ko'chirildi (chiqdi)",
    MovementType.TRANSFER_IN: "Ko'chirildi (keldi)",
}
_INFLOW = {MovementInput.RECEIPT: MovementType.RECEIPT, MovementInput.RETURN: MovementType.RETURN}
_OUTFLOW = {MovementInput.ISSUE: MovementType.ISSUE, MovementInput.WRITE_OFF: MovementType.WRITE_OFF}
QTY = Decimal("0.001")


def _qty(value: float | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(QTY)


def _stock_subquery(actor: User, factory_id: int | None = None, location_id: int | None = None):
    query = scoped(
        select(StockMovement.material_id, func.sum(StockMovement.quantity).label("qty")).group_by(StockMovement.material_id),
        actor, StockMovement.factory_id, factory_id,
    )
    if location_id is not None:
        query = query.where(StockMovement.location_id == location_id)
    return query.subquery()


def _balance(db: Session, material_id: int, location_id: int) -> Decimal:
    value = db.scalar(
        select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(
            StockMovement.material_id == material_id, StockMovement.location_id == location_id
        )
    )
    return _qty(value or 0)


def _lock_material(db: Session, material_id: int) -> None:
    """Bir material bo'yicha bir vaqtdagi chiqimlar qoldiqni manfiyga tushirmasin (PostgreSQL)."""
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": 900_000_000 + material_id})


def _material_out(material: Material, stock: Decimal | float | None, factory_name: str | None = None) -> MaterialOut:
    qty = float(stock or 0)
    out = MaterialOut.model_validate(material)
    out.stock = round(qty, 3)
    out.stock_value = round(qty * float(material.unit_cost), 2) if material.unit_cost is not None else None
    out.is_low = float(material.min_stock) > 0 and qty <= float(material.min_stock)
    out.factory_name = factory_name
    return out


def _get_material(db: Session, actor: User, material_id: int) -> Material:
    material = db.get(Material, material_id)
    if material is None or not can_access(actor, material.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Material topilmadi")
    return material


def _ensure_material_code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None) -> None:
    query = select(Material.id).where(Material.factory_id == factory_id, Material.code == code)
    if exclude_id is not None:
        query = query.where(Material.id != exclude_id)
    if db.scalar(query) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, t("'{code}' kodli material allaqachon mavjud", code=code))


def list_materials(
    db: Session,
    actor: User,
    *,
    search: str | None = None,
    material_type: str | None = None,
    stock_state: str | None = None,
    is_active: bool | None = True,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> MaterialPage:
    stock = _stock_subquery(actor, factory_id)
    qty = func.coalesce(stock.c.qty, 0)
    query = (
        select(Material, qty.label("stock"), Factory.name)
        .outerjoin(stock, stock.c.material_id == Material.id)
        .join(Factory, Factory.id == Material.factory_id)
    )
    query = scoped(query, actor, Material.factory_id, factory_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Material.name.ilike(pattern), Material.code.ilike(pattern), Material.color.ilike(pattern)))
    if material_type:
        query = query.where(Material.material_type == material_type)
    if is_active is not None:
        query = query.where(Material.is_active.is_(is_active))
    if stock_state == "low":
        query = query.where(Material.min_stock > 0, qty <= Material.min_stock)
    elif stock_state == "out":
        query = query.where(qty <= 0)
    elif stock_state == "in":
        query = query.where(qty > 0)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(Material.name, Material.id).offset(offset).limit(limit)).all()
    return MaterialPage(items=[_material_out(m, s, fname) for m, s, fname in rows], total=total)


def get_material(db: Session, actor: User, material_id: int) -> MaterialDetail:
    material = _get_material(db, actor, material_id)
    rows = db.execute(
        select(WarehouseLocation, func.sum(StockMovement.quantity))
        .join(StockMovement, StockMovement.location_id == WarehouseLocation.id)
        .where(StockMovement.material_id == material.id)
        .group_by(WarehouseLocation.id)
        .order_by(WarehouseLocation.code)
    ).all()
    locations = [
        LocationStock(location_id=loc.id, location_code=loc.code, location_name=loc.name, quantity=round(float(q), 3))
        for loc, q in rows
        if q and _qty(q) != 0
    ]
    total = sum(Decimal(str(loc.quantity)) for loc in locations)
    out = MaterialDetail(**_material_out(material, total).model_dump(), locations=locations)
    out.bom_usage_count = db.scalar(
        select(func.count(func.distinct(BOMItem.product_id))).where(BOMItem.material_id == material.id)
    ) or 0
    return out


def create_material(db: Session, actor: User, data: MaterialCreate) -> MaterialDetail:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    _ensure_material_code_free(db, factory_id, data.code)
    material = Material(factory_id=factory_id, **data.model_dump(exclude={"factory_id"}))
    db.add(material)
    db.flush()
    audit_service.record(
        db, actor, entity="material", entity_id=material.id, action=AuditAction.CREATE,
        summary=f"Material qo'shildi: {material.code} — {material.name}", factory_id=factory_id,
    )
    db.commit()
    return get_material(db, actor, material.id)


def update_material(db: Session, actor: User, material_id: int, data: MaterialUpdate) -> MaterialDetail:
    material = _get_material(db, actor, material_id)
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k in ("color", "notes", "unit_cost")}
    if "code" in values:
        _ensure_material_code_free(db, material.factory_id, values["code"], exclude_id=material.id)
    if "unit" in values and values["unit"] != material.unit and _has_movements(db, material.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ombor tarixi bor materialning o'lchov birligini o'zgartirib bo'lmaydi")
    changes = audit_service.diff(material, values)
    for field, value in values.items():
        setattr(material, field, value)
    if {"name", "material_type", "unit"} & changes.keys():
        for item in db.scalars(select(BOMItem).where(BOMItem.material_id == material.id)):
            item.material_name, item.material_type, item.unit = material.name, material.material_type, material.unit
    if changes:
        audit_service.record(
            db, actor, entity="material", entity_id=material.id, action=AuditAction.UPDATE,
            summary=f"Material o'zgartirildi: {material.code}", factory_id=material.factory_id, changes=changes,
        )
    db.commit()
    return get_material(db, actor, material.id)


def _has_movements(db: Session, material_id: int) -> bool:
    return db.scalar(select(StockMovement.id).where(StockMovement.material_id == material_id).limit(1)) is not None


def delete_material(db: Session, actor: User, material_id: int) -> None:
    material = _get_material(db, actor, material_id)
    if _has_movements(db, material.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Materialning ombor tarixi bor — o'chirish o'rniga nofaol qiling"
        )
    if db.scalar(select(PurchaseOrderItem.id).where(PurchaseOrderItem.material_id == material.id).limit(1)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Material xarid buyurtmalarida bor — o'chirish o'rniga nofaol qiling")
    audit_service.record(
        db, actor, entity="material", entity_id=material.id, action=AuditAction.DELETE,
        summary=f"Material o'chirildi: {material.code} — {material.name}", factory_id=material.factory_id,
    )
    db.delete(material)
    db.commit()


def _get_location(db: Session, actor: User, location_id: int) -> WarehouseLocation:
    location = db.get(WarehouseLocation, location_id)
    if location is None or not can_access(actor, location.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ombor joyi topilmadi")
    return location


def _ensure_location_code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None) -> None:
    query = select(WarehouseLocation.id).where(WarehouseLocation.factory_id == factory_id, WarehouseLocation.code == code)
    if exclude_id is not None:
        query = query.where(WarehouseLocation.id != exclude_id)
    if db.scalar(query) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, t("'{code}' kodli joy allaqachon mavjud", code=code))


def list_locations(db: Session, actor: User, *, include_inactive: bool = False, factory_id: int | None = None) -> list[LocationOut]:
    per_material = scoped(
        select(StockMovement.location_id, StockMovement.material_id)
        .group_by(StockMovement.location_id, StockMovement.material_id)
        .having(func.sum(StockMovement.quantity) != 0),
        actor, StockMovement.factory_id, factory_id,
    ).subquery()
    counts = (
        select(per_material.c.location_id, func.count().label("n")).group_by(per_material.c.location_id).subquery()
    )
    query = scoped(
        select(WarehouseLocation, func.coalesce(counts.c.n, 0)).outerjoin(counts, counts.c.location_id == WarehouseLocation.id),
        actor,
        WarehouseLocation.factory_id,
        factory_id,
    )
    if not include_inactive:
        query = query.where(WarehouseLocation.is_active.is_(True))
    result = []
    for location, n in db.execute(query.order_by(WarehouseLocation.code)).all():
        out = LocationOut.model_validate(location)
        out.materials_count = n
        result.append(out)
    return result


def create_location(db: Session, actor: User, data: LocationCreate) -> LocationOut:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    _ensure_location_code_free(db, factory_id, data.code)
    location = WarehouseLocation(factory_id=factory_id, code=data.code, name=data.name)
    db.add(location)
    db.flush()
    audit_service.record(
        db, actor, entity="warehouse_location", entity_id=location.id, action=AuditAction.CREATE,
        summary=f"Ombor joyi qo'shildi: {location.code} — {location.name}", factory_id=factory_id,
    )
    db.commit()
    return LocationOut.model_validate(location)


def update_location(db: Session, actor: User, location_id: int, data: LocationUpdate) -> LocationOut:
    location = _get_location(db, actor, location_id)
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if "code" in values:
        _ensure_location_code_free(db, location.factory_id, values["code"], exclude_id=location.id)
    changes = audit_service.diff(location, values)
    for field, value in values.items():
        setattr(location, field, value)
    if changes:
        audit_service.record(
            db, actor, entity="warehouse_location", entity_id=location.id, action=AuditAction.UPDATE,
            summary=f"Ombor joyi o'zgartirildi: {location.code}", factory_id=location.factory_id, changes=changes,
        )
    db.commit()
    return LocationOut.model_validate(location)


def delete_location(db: Session, actor: User, location_id: int) -> None:
    location = _get_location(db, actor, location_id)
    if db.scalar(select(StockMovement.id).where(StockMovement.location_id == location.id).limit(1)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu joyda harakatlar tarixi bor — o'chirish o'rniga nofaol qiling")
    audit_service.record(
        db, actor, entity="warehouse_location", entity_id=location.id, action=AuditAction.DELETE,
        summary=f"Ombor joyi o'chirildi: {location.code}", factory_id=location.factory_id,
    )
    db.delete(location)
    db.commit()


def _movement_out(m: StockMovement, order_number: str | None = None) -> MovementOut:
    return MovementOut(
        id=m.id,
        factory_id=m.factory_id,
        movement_type=m.movement_type,
        quantity=float(m.quantity),
        unit_cost=float(m.unit_cost) if m.unit_cost is not None else None,
        material=Ref(id=m.material.id, code=m.material.code, name=m.material.name),
        material_unit=m.material.unit,
        location=Ref(id=m.location.id, code=m.location.code, name=m.location.name),
        order_id=m.order_id,
        order_number=order_number,
        document_no=m.document_no,
        note=m.note,
        transfer_group=m.transfer_group,
        purchase_item_id=m.purchase_item_id,
        created_by_name=m.created_by.full_name if m.created_by else None,
        created_at=m.created_at,
    )


def notify_low_stock(db: Session, material: Material, delta: Decimal) -> None:
    """Chiqimdan keyin qoldiq minimumdan pastga tushgan paytda (bir marta) Telegram xabari."""
    if delta >= 0 or not material.min_stock:
        return
    total = Decimal(db.scalar(select(func.coalesce(func.sum(StockMovement.quantity), 0)).where(StockMovement.material_id == material.id)) or 0)
    before = total - delta
    if not (total <= material.min_stock < before or (total <= 0 < before)):
        return
    template = ("⛔ <b>{code}</b> {name} tugadi — omborda qolmadi" if total <= 0
                else "⚠️ <b>{code}</b> {name} kam qoldi: {stock} {unit} (minimum {min})")
    telegram_service.notify(db, material.factory_id, template, code=material.code, name=material.name,
                            stock=f"{total.normalize():f}", unit=material.unit.value.lower(), min=f"{Decimal(material.min_stock).normalize():f}")


def create_movement(
    db: Session, actor: User, data: MovementCreate, *, commit: bool = True, purchase_item_id: int | None = None
) -> list[MovementOut]:
    """commit=False — bir nechta harakatni bitta tranzaksiyada yozish uchun (masalan, buyurtmaga chiqarish).
    purchase_item_id — kirim xarid buyurtmasi qatori bo'yicha (faqat procurement_service beradi)."""
    material = _get_material(db, actor, data.material_id)
    location = _get_location(db, actor, data.location_id)
    if location.factory_id != material.factory_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Joy va material boshqa-boshqa fabrikaga tegishli")
    if not location.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ombor joyi nofaol")
    order = None
    if data.order_id is not None:
        order = db.get(Order, data.order_id)
        if order is None or order.factory_id != material.factory_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Buyurtma topilmadi")

    kind = data.movement_type
    qty = _qty(data.quantity)
    if kind != MovementInput.ADJUSTMENT and qty <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Miqdor 0 dan katta bo'lsin")
    if kind == MovementInput.RECEIPT and not material.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Nofaol materialga kirim qilib bo'lmaydi")

    _lock_material(db, material.id)
    balance = _balance(db, material.id, location.id)
    unit = material.unit.value.lower()
    base = dict(
        factory_id=material.factory_id,
        material_id=material.id,
        order_id=order.id if order else None,
        purchase_item_id=purchase_item_id if kind == MovementInput.RECEIPT else None,
        document_no=data.document_no,
        note=data.note,
        created_by_id=actor.id,
    )
    rows: list[StockMovement] = []

    current_cost = material.unit_cost
    if kind in _INFLOW:
        cost = _qty(data.unit_cost).quantize(Decimal("0.01")) if data.unit_cost is not None else (current_cost if kind == MovementInput.RETURN else None)
        rows.append(StockMovement(**base, location_id=location.id, movement_type=_INFLOW[kind], quantity=qty, unit_cost=cost))
        if kind == MovementInput.RECEIPT and cost is not None:
            material.unit_cost = cost
    elif kind in _OUTFLOW or kind == MovementInput.TRANSFER:
        if qty > balance:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                t("«{location}» joyida yetarli qoldiq yo'q: bor {balance} ({unit})", location=location.name, balance=f"{balance.normalize():f}", unit=unit),
            )
        if kind == MovementInput.TRANSFER:
            if data.to_location_id is None or data.to_location_id == location.id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Qaysi joyga ko'chirilishini tanlang")
            target = _get_location(db, actor, data.to_location_id)
            if target.factory_id != material.factory_id or not target.is_active:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Qabul qiluvchi joy topilmadi yoki nofaol")
            group = str(uuid.uuid4())
            rows.append(StockMovement(**base, location_id=location.id, movement_type=MovementType.TRANSFER_OUT, quantity=-qty, transfer_group=group))
            rows.append(StockMovement(**base, location_id=target.id, movement_type=MovementType.TRANSFER_IN, quantity=qty, transfer_group=group))
        else:
            rows.append(StockMovement(**base, location_id=location.id, movement_type=_OUTFLOW[kind], quantity=-qty, unit_cost=current_cost))
    else:
        delta = qty - balance
        if delta == 0:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sanoq natijasi joriy qoldiq bilan bir xil — tuzatish kerak emas")
        rows.append(StockMovement(**base, location_id=location.id, movement_type=MovementType.ADJUSTMENT, quantity=delta, unit_cost=current_cost))

    db.add_all(rows)
    db.flush()
    label = "Ko'chirish" if kind == MovementInput.TRANSFER else MOVEMENT_LABELS[rows[0].movement_type]
    signed = rows[0].quantity if kind != MovementInput.TRANSFER else qty
    audit_service.record(
        db, actor, entity="stock_movement", entity_id=rows[0].id, action=AuditAction.STOCK,
        summary=f"{label}: {material.code} {signed.normalize():f} {unit} ({location.code})",
        factory_id=material.factory_id,
        changes={"material_id": material.id, "location_id": location.id, "quantity": float(signed), "balance_before": float(balance)},
    )
    if not commit:
        return []
    db.commit()
    notify_low_stock(db, material, sum((r.quantity for r in rows), Decimal(0)))
    for row in rows:
        db.refresh(row)
    return [_movement_out(r, order.order_number if order else None) for r in rows]


def list_movements(
    db: Session,
    actor: User,
    *,
    material_id: int | None = None,
    location_id: int | None = None,
    movement_type: MovementType | None = None,
    order_id: int | None = None,
    search: str | None = None,
    date_from=None,
    date_to=None,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> MovementPage:
    query = (
        select(StockMovement, Order.order_number)
        .join(Material, Material.id == StockMovement.material_id)
        .outerjoin(Order, Order.id == StockMovement.order_id)
        .options(selectinload(StockMovement.material), selectinload(StockMovement.location), selectinload(StockMovement.created_by))
    )
    query = scoped(query, actor, StockMovement.factory_id, factory_id)
    if material_id is not None:
        query = query.where(StockMovement.material_id == material_id)
    if location_id is not None:
        query = query.where(StockMovement.location_id == location_id)
    if movement_type is not None:
        query = query.where(StockMovement.movement_type == movement_type)
    if order_id is not None:
        query = query.where(StockMovement.order_id == order_id)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(Material.name.ilike(pattern), Material.code.ilike(pattern), StockMovement.document_no.ilike(pattern), StockMovement.note.ilike(pattern))
        )
    if date_from:
        query = query.where(StockMovement.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.where(StockMovement.created_at < datetime.combine(date_to + timedelta(days=1), time.min))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).offset(offset).limit(limit)).all()
    return MovementPage(items=[_movement_out(m, number) for m, number in rows], total=total)


def summary(db: Session, actor: User, factory_id: int | None = None) -> InventorySummary:
    stock = _stock_subquery(actor, factory_id)
    qty = func.coalesce(stock.c.qty, 0)
    materials = scoped(
        select(Material, qty.label("stock")).outerjoin(stock, stock.c.material_id == Material.id).where(Material.is_active.is_(True)),
        actor,
        Material.factory_id,
        factory_id,
    ).subquery()
    m_count, low, out, value = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(case((and_(materials.c.min_stock > 0, materials.c.stock <= materials.c.min_stock), 1), else_=0)), 0),
            func.coalesce(func.sum(case((materials.c.stock <= 0, 1), else_=0)), 0),
            func.coalesce(func.sum(materials.c.stock * func.coalesce(materials.c.unit_cost, 0)), 0),
        ).select_from(materials)
    ).one()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today = datetime.combine(now.date(), time.min)
    movements = scoped(select(StockMovement), actor, StockMovement.factory_id, factory_id).subquery()
    today_count, receipts, issues = db.execute(
        select(
            func.coalesce(func.sum(case((movements.c.created_at >= today, 1), else_=0)), 0),
            func.coalesce(func.sum(case((and_(movements.c.movement_type == MovementType.RECEIPT, movements.c.created_at >= now - timedelta(days=30)), 1), else_=0)), 0),
            func.coalesce(func.sum(case((and_(movements.c.movement_type == MovementType.ISSUE, movements.c.created_at >= now - timedelta(days=30)), 1), else_=0)), 0),
        ).select_from(movements)
    ).one()
    locations = db.scalar(
        select(func.count()).select_from(
            scoped(select(WarehouseLocation.id).where(WarehouseLocation.is_active.is_(True)), actor, WarehouseLocation.factory_id, factory_id).subquery()
        )
    ) or 0
    return InventorySummary(
        materials_count=m_count,
        low_stock_count=int(low),
        out_of_stock_count=int(out),
        stock_value=round(float(value), 2),
        locations_count=locations,
        movements_today=int(today_count),
        receipts_30d=int(receipts),
        issues_30d=int(issues),
    )
