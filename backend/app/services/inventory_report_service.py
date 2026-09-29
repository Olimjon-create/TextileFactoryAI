from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.core.i18n import t
from app.core.scope import scoped
from app.models import Material, MovementType, StockMovement, User
from app.models.product import MaterialType
from app.schemas.inventory_report import TurnoverReport, TurnoverRow, TurnoverTotals, TypeValue

TASHKENT = timezone(timedelta(hours=5))
MAX_DAYS = 3 * 366
RECEIPT_TYPES = (MovementType.RECEIPT, MovementType.RETURN)
TRANSFER_TYPES = (MovementType.TRANSFER_IN, MovementType.TRANSFER_OUT)


def _bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    start = datetime(date_from.year, date_from.month, date_from.day, tzinfo=TASHKENT)
    end = datetime(date_to.year, date_to.month, date_to.day, tzinfo=TASHKENT) + timedelta(days=1)
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def _f(value) -> float:
    return round(float(value or 0), 3)


def turnover(
    db: Session, actor: User, date_from: date, date_to: date,
    factory_id: int | None = None, material_type: MaterialType | None = None,
) -> TurnoverReport:
    if date_to < date_from:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("Boshlanish sanasi tugash sanasidan keyin bo'lmasligi kerak"))
    if (date_to - date_from).days > MAX_DAYS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("Davr 3 yildan oshmasligi kerak"))
    start, end = _bounds(date_from, date_to)
    m = StockMovement
    in_period = and_(m.created_at >= start, m.created_at < end)
    qty = m.quantity
    cost = func.coalesce(m.unit_cost, 0)

    def period_sum(types, expr):
        return func.coalesce(func.sum(case((and_(in_period, m.movement_type.in_(types)), expr), else_=0)), 0)

    moves = scoped(
        select(
            m.material_id,
            func.coalesce(func.sum(case((m.created_at < start, qty), else_=0)), 0).label("opening"),
            period_sum(RECEIPT_TYPES, qty).label("receipts"),
            period_sum((MovementType.ISSUE,), -qty).label("issues"),
            period_sum((MovementType.WRITE_OFF,), -qty).label("write_offs"),
            period_sum((MovementType.ADJUSTMENT,), qty).label("adjustments"),
            func.coalesce(func.sum(case((m.created_at < end, qty), else_=0)), 0).label("closing"),
            period_sum(RECEIPT_TYPES, qty * cost).label("receipts_value"),
            period_sum((MovementType.ISSUE,), -qty * cost).label("issues_value"),
            period_sum((MovementType.WRITE_OFF,), -qty * cost).label("write_offs_value"),
            func.max(case((m.movement_type.not_in(TRANSFER_TYPES), m.created_at), else_=None)).label("last_at"),
        ).group_by(m.material_id),
        actor, m.factory_id, factory_id,
    ).subquery()

    query = scoped(
        select(Material, moves).select_from(Material).outerjoin(moves, moves.c.material_id == Material.id),
        actor, Material.factory_id, factory_id,
    ).where(Material.is_active.is_(True) | moves.c.material_id.is_not(None))
    if material_type is not None:
        query = query.where(Material.material_type == material_type)

    rows: list[TurnoverRow] = []
    totals = {"opening_value": Decimal(0), "receipts_value": Decimal(0), "issues_value": Decimal(0),
              "write_offs_value": Decimal(0), "closing_value": Decimal(0)}
    without_cost = 0
    by_type: dict[MaterialType, list] = {}
    for row in db.execute(query.order_by(Material.material_type, Material.name)):
        material: Material = row[0]
        opening, closing = Decimal(row.opening or 0), Decimal(row.closing or 0)
        unit_cost = Decimal(material.unit_cost) if material.unit_cost is not None else None
        closing_value = closing * unit_cost if unit_cost is not None else None
        if unit_cost is None and closing:
            without_cost += 1
        if unit_cost is not None:
            totals["opening_value"] += opening * unit_cost
            totals["closing_value"] += closing_value
        totals["receipts_value"] += Decimal(row.receipts_value or 0)
        totals["issues_value"] += Decimal(row.issues_value or 0)
        totals["write_offs_value"] += Decimal(row.write_offs_value or 0)
        if closing > 0:
            bucket = by_type.setdefault(material.material_type, [0, Decimal(0)])
            bucket[0] += 1
            bucket[1] += closing_value or 0
        last_at = row.last_at
        if isinstance(last_at, str):
            last_at = datetime.fromisoformat(last_at)
        rows.append(TurnoverRow(
            material_id=material.id, code=material.code, name=material.name,
            material_type=material.material_type, unit=material.unit, factory_id=material.factory_id,
            unit_cost=float(unit_cost) if unit_cost is not None else None,
            opening=_f(opening), receipts=_f(row.receipts), issues=_f(row.issues), write_offs=_f(row.write_offs),
            adjustments=_f(row.adjustments), closing=_f(closing),
            receipts_value=round(float(row.receipts_value or 0), 2), issues_value=round(float(row.issues_value or 0), 2),
            closing_value=round(float(closing_value), 2) if closing_value is not None else None,
            last_movement_at=last_at,
        ))
    return TurnoverReport(
        date_from=date_from, date_to=date_to, rows=rows,
        totals=TurnoverTotals(**{k: round(float(v), 2) for k, v in totals.items()}, without_cost=without_cost),
        by_type=sorted(
            (TypeValue(material_type=k, materials=v[0], value=round(float(v[1]), 2)) for k, v in by_type.items()),
            key=lambda x: -x.value,
        ),
    )
