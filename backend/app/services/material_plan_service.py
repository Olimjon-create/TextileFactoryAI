"""Buyurtma bo'yicha material ehtiyoji va buyurtmaga material chiqarish.

Hech narsa alohida saqlanmaydi — har safar manbalardan hisoblanadi:
  reja      = Σ (buyurtma qatori miqdori × BOM sarfi × (1 + isrof %))
  chiqarilgan = −Σ stock_movements.quantity (ISSUE va RETURN, order_id bo'yicha)
  mavjud    = ombordagi joriy qoldiq (barcha joylar)
Shuning uchun BOM, ombor yoki buyurtma o'zgarsa — ehtiyoj ham avtomatik yangilanadi.
"""

from collections import defaultdict
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.models import Material, MovementType, Order, Product, StockMovement, User, WarehouseLocation
from app.models.order import OrderStatus
from app.schemas.inventory import MovementCreate, MovementInput
from app.schemas.material_plan import (
    IssueMode,
    IssueRequest,
    MaterialRequirement,
    OrderMaterials,
    RequirementStatus,
)
from app.services import inventory_service, order_service, procurement_service
from app.core.i18n import t

# Buyurtmaga material chiqarish/qaytarish — ombor xodimlari (ombor tahrirlash huquqi)
ISSUE_ROLES = inventory_service.INVENTORY_EDITOR_ROLES
# Bu holatlarda buyurtmaga material chiqarilmaydi
NO_ISSUE_STATUSES = (OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED)
Q = Decimal("0.001")


def _q(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Q)


def _issued_by_material(db: Session, order_id: int) -> dict[int, Decimal]:
    rows = db.execute(
        select(StockMovement.material_id, func.sum(StockMovement.quantity))
        .where(
            StockMovement.order_id == order_id,
            StockMovement.movement_type.in_((MovementType.ISSUE, MovementType.RETURN)),
        )
        .group_by(StockMovement.material_id)
    ).all()
    return {material_id: -_q(total) for material_id, total in rows}


def _stock_by_material(db: Session, material_ids: set[int]) -> dict[int, Decimal]:
    if not material_ids:
        return {}
    rows = db.execute(
        select(StockMovement.material_id, func.sum(StockMovement.quantity))
        .where(StockMovement.material_id.in_(material_ids))
        .group_by(StockMovement.material_id)
    ).all()
    return {material_id: _q(total) for material_id, total in rows}


def requirements(db: Session, actor: User, order_id: int) -> OrderMaterials:
    order = order_service._get(db, actor, order_id)
    product_ids = {i.product_id for i in order.items if i.product_id is not None}
    products = {
        p.id: p for p in db.scalars(select(Product).where(Product.id.in_(product_ids)).options(selectinload(Product.bom_items)))
    }

    # key: material_id (katalog) yoki ("text", nom, birlik) — bog'lanmagan BOM qatorlari
    planned: dict = defaultdict(Decimal)
    meta: dict = {}
    used_in: dict = defaultdict(set)
    without_bom: list[str] = []
    for item in order.items:
        product = products.get(item.product_id)
        if product is None or not product.bom_items:
            without_bom.append(item.product_name)
            continue
        for bom in product.bom_items:
            qty = Decimal(item.quantity) * Decimal(bom.quantity) * (1 + Decimal(bom.waste_percent) / 100)
            key = bom.material_id if bom.material_id else ("text", bom.material_name.strip().lower(), bom.unit)
            planned[key] += qty
            used_in[key].add(item.product_name)
            meta.setdefault(key, bom)

    issued = _issued_by_material(db, order.id)
    # Rejada bo'lmasa ham buyurtmaga chiqarilgan materiallar (ortiqcha/boshqa material)
    for material_id in issued:
        planned.setdefault(material_id, Decimal(0))
    catalog_ids = {k for k in planned if isinstance(k, int)}
    materials = {m.id: m for m in db.scalars(select(Material).where(Material.id.in_(catalog_ids)))}
    stock = _stock_by_material(db, catalog_ids)
    incoming = procurement_service.on_order_by_material(db, catalog_ids)

    lines: list[MaterialRequirement] = []
    for key, plan in planned.items():
        plan = _q(plan)
        if isinstance(key, int):
            m = materials[key]
            got = issued.get(key, Decimal(0))
            available = stock.get(key, Decimal(0))
            remaining = max(plan - got, Decimal(0))
            shortage = max(remaining - available, Decimal(0))
            variance = got - plan
            cost = Decimal(m.unit_cost) if m.unit_cost is not None else None
            if variance > 0:
                state = RequirementStatus.OVERUSED
            elif remaining == 0:
                state = RequirementStatus.ISSUED
            elif shortage > 0:
                state = RequirementStatus.SHORTAGE
            else:
                state = RequirementStatus.ENOUGH
            lines.append(
                MaterialRequirement(
                    material_id=m.id, material_code=m.code, material_name=m.name, material_type=m.material_type, unit=m.unit,
                    planned=float(plan), issued=float(got), remaining=float(remaining), available=float(available),
                    shortage=float(shortage), on_order=float(incoming.get(key, 0)), variance=float(variance),
                    variance_pct=round(float(variance / plan * 100), 1) if plan > 0 else None,
                    unit_cost=float(cost) if cost is not None else None,
                    planned_cost=round(float(plan * cost), 2) if cost is not None else None,
                    issued_cost=round(float(got * cost), 2) if cost is not None else None,
                    status=state, products=sorted(used_in.get(key, [])),
                )
            )
        else:
            bom = meta[key]
            lines.append(
                MaterialRequirement(
                    material_id=None, material_code=None, material_name=bom.material_name, material_type=bom.material_type,
                    unit=bom.unit, planned=float(plan), issued=0, remaining=float(plan), available=0, shortage=0,
                    variance=0, variance_pct=None, unit_cost=None, planned_cost=None, issued_cost=None,
                    status=RequirementStatus.NOT_LINKED, products=sorted(used_in[key]),
                )
            )

    order_of = {RequirementStatus.SHORTAGE: 0, RequirementStatus.OVERUSED: 1, RequirementStatus.NOT_LINKED: 2, RequirementStatus.ENOUGH: 3, RequirementStatus.ISSUED: 4}
    lines.sort(key=lambda r: (order_of[r.status], r.material_name.lower()))
    count = lambda s: sum(1 for r in lines if r.status == s)  # noqa: E731
    return OrderMaterials(
        order_id=order.id,
        lines=lines,
        products_without_bom=sorted(set(without_bom)),
        shortage_count=count(RequirementStatus.SHORTAGE),
        not_linked_count=count(RequirementStatus.NOT_LINKED),
        overused_count=count(RequirementStatus.OVERUSED),
        planned_cost=round(sum(r.planned_cost or 0 for r in lines), 2),
        issued_cost=round(sum(r.issued_cost or 0 for r in lines), 2),
        complete=not without_bom and count(RequirementStatus.NOT_LINKED) == 0,
    )


def _locations_with_stock(db: Session, material_id: int) -> list[tuple[int, Decimal]]:
    """Material qoldig'i bor faol joylar — ko'pidan boshlab (kamroq harakat bilan chiqarish uchun)."""
    rows = db.execute(
        select(StockMovement.location_id, func.sum(StockMovement.quantity))
        .join(WarehouseLocation, WarehouseLocation.id == StockMovement.location_id)
        .where(StockMovement.material_id == material_id, WarehouseLocation.is_active.is_(True))
        .group_by(StockMovement.location_id)
    ).all()
    return sorted(((loc, _q(q)) for loc, q in rows if _q(q) > 0), key=lambda x: x[1], reverse=True)


def issue(db: Session, actor: User, order_id: int, data: IssueRequest) -> OrderMaterials:
    """Buyurtmaga material chiqarish yoki qaytarish — barcha qatorlar bitta tranzaksiyada (yoki hech biri)."""
    order: Order = order_service._get(db, actor, order_id)
    if data.mode == IssueMode.ISSUE and order.status in NO_ISSUE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Jo'natilgan, yakunlangan yoki bekor qilingan buyurtmaga material chiqarilmaydi")
    if actor.role != Role.SUPER_ADMIN and order.factory_id != actor.factory_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buyurtma topilmadi")

    try:
        for line in data.lines:
            material = db.get(Material, line.material_id)
            if material is None or material.factory_id != order.factory_id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Material topilmadi")
            qty = _q(line.quantity)
            base = dict(material_id=material.id, order_id=order.id, note=data.note, document_no=order.order_number)

            if data.mode == IssueMode.RETURN:
                if line.location_id is None:
                    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("{code}: qaysi joyga qaytarilishini tanlang", code=material.code))
                issued = _issued_by_material(db, order.id).get(material.id, Decimal(0))
                if qty > issued:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        t("{code}: buyurtmaga {issued} chiqarilgan — undan ko'p qaytarib bo'lmaydi", code=material.code, issued=f"{issued.normalize():f}"),
                    )
                inventory_service.create_movement(
                    db, actor, MovementCreate(movement_type=MovementInput.RETURN, location_id=line.location_id, quantity=float(qty), **base), commit=False
                )
                continue

            if line.location_id is not None:
                plan = [(line.location_id, qty)]
            else:
                plan, left = [], qty
                for location_id, available in _locations_with_stock(db, material.id):
                    take = min(available, left)
                    plan.append((location_id, take))
                    left -= take
                    if left == 0:
                        break
                if left > 0:
                    total = qty - left
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        t("{code}: omborda yetarli emas — bor {have}, kerak {need}", code=material.code, have=f"{total.normalize():f}", need=f"{qty.normalize():f}"),
                    )
            for location_id, take in plan:
                inventory_service.create_movement(
                    db, actor, MovementCreate(movement_type=MovementInput.ISSUE, location_id=location_id, quantity=float(take), **base), commit=False
                )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return requirements(db, actor, order.id)
