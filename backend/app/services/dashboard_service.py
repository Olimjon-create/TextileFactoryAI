"""Dashboard: platforma statistikasi (foydalanuvchilar, fabrikalar) va rahbar dashboardi (modullar ko'rsatkichlari)."""

from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.core.scope import scoped
from app.models import Factory, MovementType, Order, ProductionLog, StockMovement, User
from app.models.order import OrderStatus, PaymentStatus
from app.models.resources import ProductionStage
from app.schemas.analytics import DayPoint, OverviewOut, ProductionSection, SalesSection
from app.schemas.dashboard import DashboardStats
from app.services import (
    costing_service,
    inventory_service,
    logistics_service,
    machine_service,
    order_service,
    procurement_service,
    production_service,
)


def get_stats(db: Session, actor: User) -> DashboardStats:
    user_query = select(User)
    factory_query = select(Factory)
    if actor.role != Role.SUPER_ADMIN:
        user_query = user_query.where(User.factory_id == actor.factory_id)
        factory_query = factory_query.where(Factory.id == actor.factory_id)

    users = user_query.subquery()
    factories = factory_query.subquery()

    total_users = db.scalar(select(func.count()).select_from(users)) or 0
    active_users = db.scalar(select(func.count()).select_from(users).where(users.c.is_active)) or 0
    total_factories = db.scalar(select(func.count()).select_from(factories)) or 0
    active_factories = (
        db.scalar(select(func.count()).select_from(factories).where(factories.c.is_active)) or 0
    )

    by_role = {role.value: 0 for role in Role}
    for role, count in db.execute(select(users.c.role, func.count()).group_by(users.c.role)):
        by_role[Role(role).value] = count

    return DashboardStats(
        total_factories=total_factories,
        active_factories=active_factories,
        total_users=total_users,
        active_users=active_users,
        users_by_role=by_role,
    )


# ---------- rahbar dashboardi: mavjud modullar ko'rsatkichlari (rolga qarab) ----------

TREND_DAYS = 14


def _days(today: date) -> list[date]:
    return [today - timedelta(days=i) for i in range(TREND_DAYS - 1, -1, -1)]


def _sales(db: Session, actor: User, factory_id: int | None, today: date) -> SalesSection:
    visible = order_service._visible(select(Order), actor)
    if factory_id is not None and actor.role == Role.SUPER_ADMIN:
        visible = visible.where(Order.factory_id == factory_id)
    orders = visible.subquery()
    by_status = {s.value: 0 for s in OrderStatus if s != OrderStatus.PENDING_PAYMENT}
    for st, n in db.execute(select(orders.c.status, func.count()).group_by(orders.c.status)):
        by_status[OrderStatus(st).value] = n
    closed = [s.value for s in order_service.CLOSED_STATUSES]
    open_q = select(func.count()).select_from(orders).where(orders.c.status.not_in(closed))
    since = datetime.combine(today - timedelta(days=TREND_DAYS - 1), time.min)
    since_30 = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    paid = select(orders.c.paid_at, orders.c.total_amount).where(orders.c.payment_status == PaymentStatus.PAID.value)
    revenue_by_day: dict[date, float] = defaultdict(float)
    revenue_30d, orders_30d = 0.0, 0
    for paid_at, amount in db.execute(paid.where(orders.c.paid_at >= min(since, since_30))):
        stamp = paid_at.replace(tzinfo=None)
        if stamp >= since_30:
            revenue_30d += float(amount)
            orders_30d += 1
        revenue_by_day[stamp.date()] += float(amount)
    return SalesSection(
        by_status=by_status,
        open_orders=db.scalar(open_q) or 0,
        overdue=db.scalar(open_q.where(orders.c.due_date < today)) or 0,
        due_7d=db.scalar(open_q.where(orders.c.due_date >= today, orders.c.due_date <= today + timedelta(days=7))) or 0,
        revenue_30d=round(revenue_30d, 2),
        orders_30d=orders_30d,
        revenue_by_day=[DayPoint(day=d, value=round(revenue_by_day.get(d, 0), 2)) for d in _days(today)],
    )


def _production(db: Session, actor: User, factory_id: int | None, today: date) -> ProductionSection:
    logs = scoped(select(ProductionLog), actor, ProductionLog.factory_id, factory_id).where(
        ProductionLog.work_date >= today - timedelta(days=TREND_DAYS - 1)
    ).subquery()
    packed: dict[date, int] = defaultdict(int)
    defects: dict[date, int] = defaultdict(int)
    for day, stage, good, bad in db.execute(
        select(logs.c.work_date, logs.c.stage, func.sum(logs.c.quantity_good), func.sum(logs.c.quantity_defect)).group_by(logs.c.work_date, logs.c.stage)
    ):
        if ProductionStage(stage) == ProductionStage.PACKING:
            packed[day] += int(good or 0)
        defects[day] += int(bad or 0)
    reasons = scoped(
        select(ProductionLog.defect_reason, func.sum(ProductionLog.quantity_defect).label("qty"))
        .where(ProductionLog.quantity_defect > 0, ProductionLog.work_date >= today - timedelta(days=30))
        .group_by(ProductionLog.defect_reason),
        actor, ProductionLog.factory_id, factory_id,
    ).order_by(func.sum(ProductionLog.quantity_defect).desc()).limit(5)
    return ProductionSection(
        summary=production_service.summary(db, actor, factory_id),
        packed_by_day=[DayPoint(day=d, value=packed.get(d, 0), extra=defects.get(d, 0)) for d in _days(today)],
        top_defects=[{"reason": r or "—", "quantity": int(q or 0)} for r, q in db.execute(reasons)],
    )


def overview(db: Session, actor: User, factory_id: int | None = None) -> OverviewOut:
    """Har bir bo'lim — faqat shu modulni ko'ra oladigan rollarga (modulning o'z huquqlari bilan bir xil)."""
    today = date.today()
    role = actor.role
    out = OverviewOut()
    if role in order_service.ORDER_VIEW_ROLES:
        out.sales = _sales(db, actor, factory_id, today)
    if role in production_service.PRODUCTION_VIEW_ROLES:
        out.production = _production(db, actor, factory_id, today)
    if role in inventory_service.INVENTORY_VIEW_ROLES:
        out.inventory = inventory_service.summary(db, actor, factory_id)
    if role in logistics_service.LOGISTICS_VIEW_ROLES:
        out.finished_goods = logistics_service.summary(db, actor, factory_id)
    if role in procurement_service.PROCUREMENT_VIEW_ROLES:
        out.procurement = procurement_service.summary(db, actor, factory_id)
    if role in machine_service.MACHINE_VIEW_ROLES:
        out.resources = machine_service.summary(db, actor, factory_id)
    if role in costing_service.FINANCE_ROLES:
        since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
        q = scoped(
            select(func.coalesce(func.sum(-StockMovement.quantity * func.coalesce(StockMovement.unit_cost, 0)), 0)).where(
                StockMovement.order_id.is_not(None), StockMovement.movement_type.in_((MovementType.ISSUE, MovementType.RETURN)),
                StockMovement.created_at >= since,
            ),
            actor, StockMovement.factory_id, factory_id,
        )
        out.material_issued_30d = round(float(db.scalar(q) or 0), 2)
    return out
