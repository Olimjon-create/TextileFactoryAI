"""Tannarx (costing) va fabrika sozlamalari.

Tannarx alohida saqlanmaydi — mavjud jurnallardan hisoblanadi:
  material  = buyurtmaga chiqarilgan − qaytarilgan (stock_movements, chiqim paytidagi narx bilan;
              eski yozuvlarda narx bo'lmasa — materialning joriy narxi);
  ish haqi  = ish buyurtmalari yozuvlari × xodim stavkasi:
              ishbay — yaroqli dona × stavka; soatbay — ish vaqti × stavka;
              oylik — ish vaqti × (oylik / oylik ish soati, sozlamadan);
  ustama    = (material + ish haqi) × ustama %, sozlamadan;
  foyda     = buyurtma summasi − jami tannarx.
"""

from collections import defaultdict
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.scope import resolve_factory_id
from app.models import Employee, FactorySettings, Material, MovementType, Order, ProductionLog, StockMovement, User, WorkOrder
from app.models.analytics import SETTINGS_DEFAULTS
from app.models.audit import AuditAction
from app.models.resources import PayType, ProductionStage
from app.schemas.analytics import CostLine, LaborLine, OrderCosting, SettingsOut, SettingsUpdate
from app.services import audit_service, material_plan_service, order_service, workforce_service
from app.core.i18n import t

FINANCE_ROLES = workforce_service.PAY_VIEW_ROLES
SETTINGS_EDITOR_ROLES = FINANCE_ROLES

MONEY = Decimal("0.01")


def _m(v: Decimal) -> float:
    return float(v.quantize(MONEY))


def settings_for(db: Session, factory_id: int) -> FactorySettings:
    """Saqlanmagan bo'lsa — boshlang'ich qiymatlar bilan (bazaga yozmasdan)."""
    row = db.scalar(select(FactorySettings).where(FactorySettings.factory_id == factory_id))
    return row or FactorySettings(factory_id=factory_id, **SETTINGS_DEFAULTS)


def get_settings(db: Session, actor: User, factory_id: int | None = None) -> SettingsOut:
    return SettingsOut.model_validate(settings_for(db, resolve_factory_id(db, actor, factory_id)))


def update_settings(db: Session, actor: User, data: SettingsUpdate, factory_id: int | None = None) -> SettingsOut:
    fid = resolve_factory_id(db, actor, factory_id)
    row = db.scalar(select(FactorySettings).where(FactorySettings.factory_id == fid))
    if row is None:
        row = FactorySettings(factory_id=fid, **SETTINGS_DEFAULTS)
        db.add(row)
    values = {k: Decimal(str(v)) for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    changes = audit_service.diff(row, values)
    for field, value in values.items():
        setattr(row, field, value)
    if changes:
        db.flush()
        audit_service.record(db, actor, entity="factory_settings", entity_id=row.id, action=AuditAction.UPDATE,
                             summary="Tannarx va ogohlantirish sozlamalari o'zgartirildi", factory_id=fid, changes=changes)
    db.commit()
    return SettingsOut.model_validate(row)


def _material_costs(db: Session, order_ids: list[int]) -> dict[int, list[tuple[Material, Decimal, Decimal, bool]]]:
    """Buyurtma bo'yicha: [(material, sof chiqarilgan miqdor, qiymat, narxsiz)]."""
    result: dict[int, list] = defaultdict(list)
    if not order_ids:
        return result
    cost = func.coalesce(StockMovement.unit_cost, Material.unit_cost)
    rows = db.execute(
        select(
            StockMovement.order_id, Material,
            func.sum(StockMovement.quantity),
            func.sum(StockMovement.quantity * cost),
            func.sum(case((cost.is_(None), 1), else_=0)),
        )
        .join(Material, Material.id == StockMovement.material_id)
        .where(StockMovement.order_id.in_(order_ids), StockMovement.movement_type.in_((MovementType.ISSUE, MovementType.RETURN)))
        .group_by(StockMovement.order_id, Material.id)
    ).all()
    for order_id, material, qty, value, unpriced in rows:
        net = -Decimal(str(qty or 0))
        if net == 0 and not value:
            continue
        result[order_id].append((material, net, -Decimal(str(value or 0)), bool(unpriced)))
    return result


def _labor(db: Session, order_ids: list[int], monthly_hours: Decimal) -> dict[int, dict[int | None, dict]]:
    """Buyurtma → xodim → {good, minutes, cost, unpriced}."""
    result: dict[int, dict] = defaultdict(lambda: defaultdict(lambda: {"good": 0, "minutes": 0, "cost": Decimal(0), "unpriced": 0, "employee": None}))
    if not order_ids:
        return result
    rows = db.execute(
        select(WorkOrder.order_id, ProductionLog, Employee)
        .join(WorkOrder, WorkOrder.id == ProductionLog.work_order_id)
        .outerjoin(Employee, Employee.id == ProductionLog.employee_id)
        .where(WorkOrder.order_id.in_(order_ids))
    ).all()
    for order_id, log, emp in rows:
        slot = result[order_id][emp.id if emp else None]
        slot["employee"] = emp
        slot["good"] += log.quantity_good
        slot["minutes"] += log.duration_minutes or 0
        rate = Decimal(emp.pay_rate) if emp and emp.pay_rate is not None else None
        if rate is None:
            slot["unpriced"] += 1
        elif emp.pay_type == PayType.PIECE:
            slot["cost"] += rate * log.quantity_good
        elif log.duration_minutes:
            hourly = rate if emp.pay_type == PayType.HOURLY else rate / monthly_hours
            slot["cost"] += hourly * Decimal(log.duration_minutes) / 60
        else:
            slot["unpriced"] += 1
    return result


def _packed(db: Session, order_ids: list[int]) -> dict[int, int]:
    if not order_ids:
        return {}
    rows = db.execute(
        select(WorkOrder.order_id, func.sum(ProductionLog.quantity_good))
        .join(WorkOrder, WorkOrder.id == ProductionLog.work_order_id)
        .where(WorkOrder.order_id.in_(order_ids), ProductionLog.stage == ProductionStage.PACKING)
        .group_by(WorkOrder.order_id)
    ).all()
    return {oid: int(q or 0) for oid, q in rows}


def _costing(order: Order, settings: FactorySettings, materials: list, labor: dict, packed: int, planned: Decimal,
             detail: bool = True) -> OrderCosting:
    warnings = []
    material_cost = sum((v for _, _, v, _ in materials), Decimal(0))
    labor_cost = sum((s["cost"] for s in labor.values()), Decimal(0))
    overhead_pct = Decimal(settings.overhead_percent)
    overhead = (material_cost + labor_cost) * overhead_pct / 100
    total = material_cost + labor_cost + overhead
    revenue = Decimal(order.total_amount)
    margin = revenue - total
    margin_pct = float((margin / revenue * 100).quantize(Decimal("0.1"))) if revenue else None
    if not materials:
        warnings.append("Buyurtmaga hali material chiqarilmagan — material tannarxi 0")
    if any(u for *_, u in materials):
        warnings.append("Ba'zi materiallarning narxi kiritilmagan")
    if sum(s["unpriced"] for s in labor.values()):
        warnings.append("Ba'zi ishlab chiqarish yozuvlarida xodim, stavka yoki ish vaqti yo'q — ish haqiga kirmagan")
    if not labor:
        warnings.append("Ishlab chiqarish yozuvlari yo'q — ish haqi 0")
    ordered = sum(i.quantity for i in order.items)
    if packed < ordered:
        warnings.insert(0, t("Buyurtma hali tugallanmagan ({packed}/{ordered} dona qadoqlangan) — foyda yakuniy emas, xarajatlar hali qo'shiladi", packed=packed, ordered=ordered))
    return OrderCosting(
        order_id=order.id, order_number=order.order_number, currency=order.currency, revenue=_m(revenue),
        ordered_qty=ordered, produced_qty=packed, material_planned=_m(planned), material_actual=_m(material_cost),
        labor=_m(labor_cost), overhead_percent=float(overhead_pct), overhead=_m(overhead), total_cost=_m(total),
        cost_per_unit=_m(total / packed) if packed else None, margin=_m(margin), margin_pct=margin_pct,
        low_margin=margin_pct is not None and bool(materials) and packed >= ordered and margin_pct < float(settings.low_margin_percent),
        materials=[
            CostLine(material_id=m.id, code=m.code, name=m.name, unit=m.unit.value, quantity=float(q), cost=_m(v), unpriced=u)
            for m, q, v, u in sorted(materials, key=lambda x: -x[2])
        ] if detail else [],
        labor_lines=[
            LaborLine(
                employee_id=emp_id, name=s["employee"].full_name if s["employee"] else "Xodim ko'rsatilmagan",
                pay_type=s["employee"].pay_type.value if s["employee"] else None, good=s["good"], minutes=s["minutes"],
                cost=_m(s["cost"]), unpriced_logs=s["unpriced"],
            )
            for emp_id, s in sorted(labor.items(), key=lambda x: -x[1]["cost"])
        ] if detail else [],
        warnings=warnings,
    )


def order_costing(db: Session, actor: User, order_id: int) -> OrderCosting:
    order = order_service._get(db, actor, order_id)
    settings = settings_for(db, order.factory_id)
    materials = _material_costs(db, [order.id]).get(order.id, [])
    labor = _labor(db, [order.id], Decimal(settings.monthly_work_hours)).get(order.id, {})
    planned = Decimal(str(material_plan_service.requirements(db, actor, order.id).planned_cost))
    return _costing(order, settings, materials, labor, _packed(db, [order.id]).get(order.id, 0), planned)


def orders_costing(db: Session, orders: list[Order]) -> list[OrderCosting]:
    """Hisobot uchun: bir nechta buyurtma (rejadagi material hisoblanmaydi — og'ir)."""
    if not orders:
        return []
    ids = [o.id for o in orders]
    settings = {fid: settings_for(db, fid) for fid in {o.factory_id for o in orders}}
    materials = _material_costs(db, ids)
    packed = _packed(db, ids)
    result = []
    by_factory: dict[int, list[int]] = defaultdict(list)
    for o in orders:
        by_factory[o.factory_id].append(o.id)
    labor: dict = {}
    for fid, oids in by_factory.items():
        labor.update(_labor(db, oids, Decimal(settings[fid].monthly_work_hours)))
    for o in orders:
        result.append(_costing(o, settings[o.factory_id], materials.get(o.id, []), labor.get(o.id, {}), packed.get(o.id, 0), Decimal(0), detail=False))
    return result

