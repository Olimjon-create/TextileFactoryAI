"""Hisobotlar: mavjud jurnallardan jadval (ustunlar + qatorlar + jami). CSV eksport — frontendda shu jadvaldan.

Har bir hisobot o'z modulining ko'rish huquqi bilan himoyalangan (yangi huquq qoidalari yaratilmaydi).
"""

from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.scope import scoped
from app.models import Order, ProductionLog, Supplier, User
from app.models.order import OrderStatus
from app.models.production import STAGE_ROUTE
from app.schemas.analytics import ReportColumn, ReportInfo, ReportTable
from app.services import (
    costing_service,
    inventory_service,
    order_service,
    procurement_service,
    production_service,
)

MAX_ROWS = 5000
MAX_RANGE_DAYS = 366

STATUS_UZ = {
    "NEW": "Yangi", "CONFIRMED": "Tasdiqlangan", "IN_PRODUCTION": "Ishlab chiqarishda", "READY": "Tayyor",
    "SHIPPED": "Jo'natilgan", "COMPLETED": "Yakunlangan", "CANCELLED": "Bekor qilingan",
}


def C(key: str, label: str, type_: str = "text") -> ReportColumn:
    return ReportColumn(key=key, label=label, type=type_)


def _range(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    return datetime.combine(date_from, time.min), datetime.combine(date_to + timedelta(days=1), time.min)


def production(db: Session, actor: User, date_from: date, date_to: date) -> ReportTable:
    rows = db.execute(
        scoped(
            select(ProductionLog.work_date, ProductionLog.stage, func.sum(ProductionLog.quantity_good), func.sum(ProductionLog.quantity_defect))
            .where(ProductionLog.work_date >= date_from, ProductionLog.work_date <= date_to)
            .group_by(ProductionLog.work_date, ProductionLog.stage),
            actor, ProductionLog.factory_id,
        )
    ).all()
    days: dict[date, dict] = defaultdict(lambda: {s.value: 0 for s in STAGE_ROUTE} | {"defect": 0})
    for day, stage, good, bad in rows:
        days[day][stage.value if hasattr(stage, "value") else stage] += int(good or 0)
        days[day]["defect"] += int(bad or 0)
    out = []
    for day in sorted(days):
        d = days[day]
        worked = sum(d[s.value] for s in STAGE_ROUTE) + d["defect"]
        out.append({"day": day.isoformat(), **d, "defect_pct": round(d["defect"] / worked * 100, 1) if worked else None})
    totals = {s.value: sum(r[s.value] for r in out) for s in STAGE_ROUTE} | {"defect": sum(r["defect"] for r in out)}
    worked = sum(totals[s.value] for s in STAGE_ROUTE) + totals["defect"]
    totals |= {"day": "Jami", "defect_pct": round(totals["defect"] / worked * 100, 1) if worked else None}
    cols = [C("day", "Sana", "date")] + [C(s.value, production_service.STAGE_NAMES[s], "number") for s in STAGE_ROUTE]
    cols += [C("defect", "Brak", "number"), C("defect_pct", "Brak %", "percent")]
    return ReportTable(kind="production", title="Ishlab chiqarish (kunlar bo'yicha, yaroqli dona)", date_from=date_from, date_to=date_to,
                       columns=cols, rows=out, totals=totals)


def defects(db: Session, actor: User, date_from: date, date_to: date) -> ReportTable:
    rows = db.execute(
        scoped(
            select(ProductionLog.stage, ProductionLog.defect_reason, func.sum(ProductionLog.quantity_defect), func.count())
            .where(ProductionLog.quantity_defect > 0, ProductionLog.work_date >= date_from, ProductionLog.work_date <= date_to)
            .group_by(ProductionLog.stage, ProductionLog.defect_reason),
            actor, ProductionLog.factory_id,
        )
    ).all()
    total = sum(int(q or 0) for _, _, q, _ in rows)
    out = sorted(
        (
            {"stage": production_service.STAGE_NAMES[stage], "reason": reason or "—", "quantity": int(q or 0), "records": n,
             "share": round(int(q or 0) / total * 100, 1) if total else None}
            for stage, reason, q, n in rows
        ),
        key=lambda r: -r["quantity"],
    )
    return ReportTable(
        kind="defects", title="Brak sabablari", date_from=date_from, date_to=date_to,
        columns=[C("stage", "Bosqich"), C("reason", "Sabab"), C("quantity", "Brak (dona)", "number"), C("records", "Yozuvlar", "number"), C("share", "Ulush", "percent")],
        rows=out, totals={"stage": "Jami", "quantity": total, "records": sum(r["records"] for r in out), "share": 100 if total else None},
    )


def employees(db: Session, actor: User, date_from: date, date_to: date) -> ReportTable:
    kpi = production_service.employee_kpi(db, actor, date_from=date_from, date_to=date_to)
    out = [
        {"code": k.employee.code, "name": k.employee.name, "department": k.department.value, "line": k.line.code if k.line else None,
         "days": k.days_worked, "good": k.good, "norm": k.norm_total, "efficiency": k.efficiency_pct, "defect": k.defect,
         "defect_rate": k.defect_rate, "per_hour": k.per_hour}
        for k in kpi
    ]
    return ReportTable(
        kind="employees", title="Xodimlar KPI", date_from=date_from, date_to=date_to,
        columns=[C("code", "Kod"), C("name", "Xodim"), C("department", "Bo'lim"), C("line", "Liniya"), C("days", "Kun", "number"),
                 C("good", "Yaroqli", "number"), C("norm", "Me'yor", "number"), C("efficiency", "Bajarilish", "percent"),
                 C("defect", "Brak", "number"), C("defect_rate", "Brak %", "percent"), C("per_hour", "Dona/soat", "number")],
        rows=out, totals={"name": "Jami", "good": sum(r["good"] for r in out), "defect": sum(r["defect"] for r in out)},
    )


def _orders_in_range(db: Session, actor: User, date_from: date, date_to: date, exclude_cancelled: bool = False) -> list[Order]:
    start, end = _range(date_from, date_to)
    q = order_service._visible(select(Order).options(selectinload(Order.items)), actor).where(Order.created_at >= start, Order.created_at < end)
    if exclude_cancelled:
        q = q.where(Order.status != OrderStatus.CANCELLED)
    return list(db.scalars(q.order_by(Order.created_at).limit(MAX_ROWS)))


def sales(db: Session, actor: User, date_from: date, date_to: date) -> ReportTable:
    orders = _orders_in_range(db, actor, date_from, date_to)
    out = [
        {"number": o.order_number, "date": o.created_at.date().isoformat(), "customer": o.customer_name,
         "source": "Katalog" if o.source.value == "STORE" else "B2B", "status": STATUS_UZ.get(o.status.value, o.status.value),
         "quantity": sum(i.quantity for i in o.items), "amount": float(o.total_amount),
         "paid": "Ha" if o.payment_status.value == "PAID" else "Yo'q", "due_date": o.due_date.isoformat() if o.due_date else None}
        for o in orders
    ]
    live = [r for r, o in zip(out, orders) if o.status != OrderStatus.CANCELLED]
    return ReportTable(
        kind="sales", title="Buyurtmalar va savdo", date_from=date_from, date_to=date_to,
        columns=[C("number", "Buyurtma"), C("date", "Sana", "date"), C("customer", "Mijoz"), C("source", "Manba"), C("status", "Holat"),
                 C("quantity", "Dona", "number"), C("amount", "Summa", "money"), C("paid", "To'langan"), C("due_date", "Muddat", "date")],
        rows=out,
        totals={"number": f"Jami ({len(live)} ta, bekorlarsiz)", "quantity": sum(r["quantity"] for r in live), "amount": round(sum(r["amount"] for r in live), 2)},
    )


def costing(db: Session, actor: User, date_from: date, date_to: date) -> ReportTable:
    orders = _orders_in_range(db, actor, date_from, date_to, exclude_cancelled=True)
    out = []
    for o, c in zip(orders, costing_service.orders_costing(db, orders)):
        out.append({"number": o.order_number, "customer": o.customer_name, "status": STATUS_UZ.get(o.status.value, o.status.value),
                    "produced": c.produced_qty, "revenue": c.revenue, "material": c.material_actual, "labor": c.labor,
                    "overhead": c.overhead, "total": c.total_cost, "per_unit": c.cost_per_unit, "margin": c.margin, "margin_pct": c.margin_pct})
    money = ("revenue", "material", "labor", "overhead", "total", "margin")
    totals = {k: round(sum(r[k] for r in out), 2) for k in money}
    totals |= {"number": "Jami", "produced": sum(r["produced"] for r in out),
               "margin_pct": round(totals["margin"] / totals["revenue"] * 100, 1) if totals["revenue"] else None}
    return ReportTable(
        kind="costing", title="Buyurtmalar tannarxi va foydasi", date_from=date_from, date_to=date_to,
        columns=[C("number", "Buyurtma"), C("customer", "Mijoz"), C("status", "Holat"), C("produced", "Qadoqlangan", "number"),
                 C("revenue", "Summa", "money"), C("material", "Material", "money"), C("labor", "Ish haqi", "money"),
                 C("overhead", "Ustama", "money"), C("total", "Tannarx", "money"), C("per_unit", "1 dona", "money"),
                 C("margin", "Foyda", "money"), C("margin_pct", "Foyda %", "percent")],
        rows=out, totals=totals,
    )


def inventory(db: Session, actor: User, date_from: date | None, date_to: date | None) -> ReportTable:
    page = inventory_service.list_materials(db, actor, is_active=None, limit=MAX_ROWS)
    out = [
        {"code": m.code, "name": m.name, "type": m.material_type.value, "unit": m.unit.value, "stock": m.stock,
         "min_stock": float(m.min_stock), "unit_cost": float(m.unit_cost) if m.unit_cost is not None else None,
         "value": m.stock_value, "state": "Tugagan" if m.stock <= 0 else "Kam" if m.is_low else "Yetarli"}
        for m in page.items
    ]
    return ReportTable(
        kind="inventory", title="Material qoldig'i va qiymati (joriy)", date_from=None, date_to=None,
        columns=[C("code", "Kod"), C("name", "Material"), C("type", "Turi"), C("unit", "Birlik"), C("stock", "Qoldiq", "number"),
                 C("min_stock", "Minimum", "number"), C("unit_cost", "Narx", "money"), C("value", "Qiymati", "money"), C("state", "Holat")],
        rows=out, totals={"code": "Jami", "value": round(sum(r["value"] or 0 for r in out), 2)},
    )


def suppliers(db: Session, actor: User, date_from: date | None, date_to: date | None) -> ReportTable:
    ids = list(db.scalars(scoped(select(Supplier.id), actor, Supplier.factory_id).order_by(Supplier.name).limit(MAX_ROWS)))
    out = []
    for sid in ids:
        s = procurement_service.get_supplier(db, actor, sid)
        st = s.stats
        out.append({"code": s.code, "name": s.name, "orders": st.orders_total, "open": st.open_orders, "overdue": st.overdue_orders,
                    "received": st.received_value, "open_value": st.open_value, "on_time": st.on_time_pct, "lead_days": st.avg_lead_days})
    return ReportTable(
        kind="suppliers", title="Yetkazib beruvchilar ko'rsatkichlari", date_from=None, date_to=None,
        columns=[C("code", "Kod"), C("name", "Yetkazib beruvchi"), C("orders", "Buyurtmalar", "number"), C("open", "Kutilmoqda", "number"),
                 C("overdue", "Kechikkan", "number"), C("received", "Qabul qilingan", "money"), C("open_value", "Yo'lda", "money"),
                 C("on_time", "Muddatida %", "percent"), C("lead_days", "O'rtacha kun", "number")],
        rows=out, totals={"code": "Jami", "received": round(sum(r["received"] for r in out), 2), "open_value": round(sum(r["open_value"] for r in out), 2)},
    )


@dataclass(frozen=True)
class Report:
    title: str
    description: str
    roles: tuple
    uses_dates: bool
    build: Callable


REPORTS: dict[str, Report] = {
    "production": Report("Ishlab chiqarish", "Kunlar va bosqichlar bo'yicha yaroqli dona va brak", production_service.PRODUCTION_VIEW_ROLES, True, production),
    "defects": Report("Brak sabablari", "Qaysi bosqichda qanday sabab bilan qancha brak", production_service.PRODUCTION_VIEW_ROLES, True, defects),
    "employees": Report("Xodimlar KPI", "Me'yor bajarilishi, brak ulushi, unumdorlik", production_service.KPI_VIEW_ROLES, True, employees),
    "sales": Report("Savdo", "Davrdagi buyurtmalar, summa va to'lov holati", order_service.ORDER_VIEW_ROLES, True, sales),
    "costing": Report("Tannarx va foyda", "Buyurtma bo'yicha material, ish haqi, ustama va foyda", costing_service.FINANCE_ROLES, True, costing),
    "inventory": Report("Ombor qiymati", "Materiallar qoldig'i, narxi va holati (joriy)", inventory_service.INVENTORY_VIEW_ROLES, False, inventory),
    "suppliers": Report("Yetkazib beruvchilar", "Xaridlar, muddatida yetkazish va o'rtacha muddat", procurement_service.PROCUREMENT_VIEW_ROLES, False, suppliers),
}


def available(actor: User) -> list[ReportInfo]:
    return [ReportInfo(kind=k, title=r.title, description=r.description, uses_dates=r.uses_dates) for k, r in REPORTS.items() if actor.role in r.roles]


def build(db: Session, actor: User, kind: str, date_from: date | None, date_to: date | None) -> ReportTable:
    report = REPORTS.get(kind)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hisobot topilmadi")
    if actor.role not in report.roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bu hisobotni ko'rishga ruxsat yo'q")
    if report.uses_dates:
        date_to = date_to or date.today()
        date_from = date_from or date_to - timedelta(days=29)
        if date_to < date_from:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Sana oralig'i noto'g'ri")
        if (date_to - date_from).days > MAX_RANGE_DAYS:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Davr 1 yildan oshmasin")
    return report.build(db, actor, date_from, date_to)

