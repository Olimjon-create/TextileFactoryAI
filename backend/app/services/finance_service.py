from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.i18n import t
from app.core.roles import Role
from app.core.scope import can_access, resolve_factory_id, scoped
from app.models import Employee, Expense, MovementType, Order, StockMovement, User
from app.models.audit import AuditAction
from app.models.order import PaymentStatus
from app.models.resources import EmployeeStatus
from app.schemas.finance import CategoryAmount, ExpenseCreate, ExpenseOut, ProfitLoss
from app.services import audit_service, order_service, payroll_service

TASHKENT = timezone(timedelta(hours=5))
CENT = Decimal("0.01")


def _to_utc(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=TASHKENT).astimezone(timezone.utc)


def _utc_bounds(start: date, end: date) -> tuple[datetime, datetime]:
    return _to_utc(start), _to_utc(end)


def _out(e: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=e.id, factory_id=e.factory_id, expense_date=e.expense_date, category=e.category, amount=float(e.amount),
        note=e.note, created_by_name=e.created_by.full_name if e.created_by else None, created_at=e.created_at,
    )


def create_expense(db: Session, actor: User, data: ExpenseCreate) -> ExpenseOut:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    e = Expense(factory_id=factory_id, expense_date=data.expense_date, category=data.category,
                amount=Decimal(str(data.amount)).quantize(CENT), note=data.note, created_by_id=actor.id)
    db.add(e)
    db.flush()
    audit_service.record(db, actor, entity="expense", entity_id=e.id, action=AuditAction.CREATE, factory_id=factory_id,
                         summary=f"Xarajat: {data.category.value} {e.amount} ({data.expense_date})")
    db.commit()
    return _out(db.scalar(select(Expense).options(selectinload(Expense.created_by)).where(Expense.id == e.id)))


def delete_expense(db: Session, actor: User, expense_id: int) -> None:
    e = db.get(Expense, expense_id)
    if e is None or not can_access(actor, e.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("Xarajat topilmadi"))
    audit_service.record(db, actor, entity="expense", entity_id=e.id, action=AuditAction.DELETE, factory_id=e.factory_id,
                         summary=f"Xarajat o'chirildi: {e.category.value} {e.amount} ({e.expense_date})")
    db.delete(e)
    db.commit()


def profit_loss(db: Session, actor: User, month: str, factory_id: int | None = None) -> ProfitLoss:
    start, end = payroll_service._period(month)
    start_utc, end_utc = _utc_bounds(start, end)

    orders = order_service._visible(select(Order.total_amount), actor).where(
        Order.payment_status == PaymentStatus.PAID, Order.paid_at >= start_utc, Order.paid_at < end_utc
    )
    if factory_id is not None and actor.role == Role.SUPER_ADMIN:
        orders = orders.where(Order.factory_id == factory_id)
    paid = orders.subquery()
    revenue_row = db.execute(select(func.coalesce(func.sum(paid.c.total_amount), 0), func.count()).select_from(paid)).one()
    revenue = Decimal(revenue_row[0] or 0)

    m = StockMovement
    materials = Decimal(db.scalar(scoped(
        select(func.coalesce(func.sum(-m.quantity * func.coalesce(m.unit_cost, 0)), 0))
        .where(m.movement_type.in_((MovementType.ISSUE, MovementType.WRITE_OFF)), m.created_at >= start_utc, m.created_at < end_utc),
        actor, m.factory_id, factory_id,
    )) or 0)

    employees = list(db.scalars(scoped(select(Employee), actor, Employee.factory_id, factory_id)
                                .where(Employee.status != EmployeeStatus.TERMINATED)))
    pay = payroll_service.build(db, employees, month)
    payroll = sum((Decimal(str(r.accrued)) for r in pay.rows), Decimal(0))

    expense_query = scoped(select(Expense), actor, Expense.factory_id, factory_id).where(
        Expense.expense_date >= start, Expense.expense_date < end
    )
    items = list(db.scalars(expense_query.options(selectinload(Expense.created_by))
                            .order_by(Expense.expense_date.desc(), Expense.id.desc())))
    by_category: dict = {}
    for e in items:
        by_category[e.category] = by_category.get(e.category, Decimal(0)) + Decimal(e.amount)
    expenses = sum(by_category.values(), Decimal(0))

    total_costs = materials + payroll + expenses
    profit = revenue - total_costs
    return ProfitLoss(
        month=month, revenue=float(revenue), orders=int(revenue_row[1] or 0), materials=float(materials.quantize(CENT)),
        payroll=float(payroll.quantize(CENT)), expenses=float(expenses),
        expenses_by_category=sorted((CategoryAmount(category=k, amount=float(v)) for k, v in by_category.items()), key=lambda x: -x.amount),
        total_costs=float(total_costs.quantize(CENT)), profit=float(profit.quantize(CENT)),
        margin_pct=round(float(profit / revenue * 100), 1) if revenue else None,
        payroll_missing_rate=pay.totals.missing_rate, items=[_out(e) for e in items],
    )
