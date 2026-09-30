from datetime import date
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.i18n import t
from app.core.scope import can_access, scoped
from app.models import Attendance, Employee, PayrollAdjustment, PayrollPayment, ProductionLog, User
from app.models.attendance import AttendanceStatus
from app.models.payroll import AdjustmentKind
from app.models.resources import EmployeeStatus, PayType
from app.schemas.payroll import AdjustmentCreate, AdjustmentOut, PaymentCreate, PayrollReport, PayrollRow, PayrollTotals
from app.services import audit_service
from app.models.audit import AuditAction

CENT = Decimal("0.01")


def _period(month: str) -> tuple[date, date]:
    try:
        year, mon = (int(x) for x in month.split("-"))
        start = date(year, mon, 1)
    except ValueError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("Oy noto'g'ri formatda (YYYY-MM)"))
    end = date(year + (mon == 12), mon % 12 + 1, 1)
    return start, end


def _money(value: Decimal) -> float:
    return float(Decimal(value).quantize(CENT))


def _grouped(db: Session, query) -> dict[int, tuple]:
    return {row[0]: tuple(row[1:]) for row in db.execute(query)}


def report(db: Session, actor: User, month: str, factory_id: int | None = None, employee_id: int | None = None) -> PayrollReport:
    start, _ = _period(month)
    adj = PayrollAdjustment
    pay = PayrollPayment
    touched = select(adj.employee_id).where(adj.period == start).union(select(pay.employee_id).where(pay.period == start))
    query = scoped(select(Employee), actor, Employee.factory_id, factory_id).where(
        (Employee.status != EmployeeStatus.TERMINATED) | Employee.id.in_(touched)
    )
    if employee_id is not None:
        query = query.where(Employee.id == employee_id)
    employees = list(db.scalars(query.order_by(Employee.department, Employee.full_name)))
    return build(db, employees, month)


def build(db: Session, employees: list[Employee], month: str) -> PayrollReport:
    start, end = _period(month)
    adj = PayrollAdjustment
    pay = PayrollPayment
    ids = [e.id for e in employees]
    if not ids:
        return PayrollReport(month=month, rows=[], totals=PayrollTotals(employees=0, base=0, bonus=0, deduction=0, advance=0, to_pay=0, paid=0, unpaid=0, missing_rate=0))

    pieces = _grouped(db, select(ProductionLog.employee_id, func.coalesce(func.sum(ProductionLog.quantity_good), 0))
                      .where(ProductionLog.employee_id.in_(ids), ProductionLog.work_date >= start, ProductionLog.work_date < end)
                      .group_by(ProductionLog.employee_id))
    att = Attendance
    attendance = _grouped(db, select(
        att.employee_id,
        func.coalesce(func.sum(att.worked_minutes), 0),
        func.sum(case((att.status == AttendanceStatus.PRESENT, 1), else_=0)),
        func.sum(case((att.status == AttendanceStatus.ABSENT, 1), else_=0)),
    ).where(att.employee_id.in_(ids), att.work_date >= start, att.work_date < end).group_by(att.employee_id))
    adjustments = _grouped(db, select(
        adj.employee_id,
        func.coalesce(func.sum(case((adj.kind == AdjustmentKind.BONUS, adj.amount), else_=0)), 0),
        func.coalesce(func.sum(case((adj.kind == AdjustmentKind.DEDUCTION, adj.amount), else_=0)), 0),
        func.coalesce(func.sum(case((adj.kind == AdjustmentKind.ADVANCE, adj.amount), else_=0)), 0),
    ).where(adj.employee_id.in_(ids), adj.period == start).group_by(adj.employee_id))
    payments = {p.employee_id: p for p in db.scalars(select(pay).where(pay.employee_id.in_(ids), pay.period == start))}

    rows: list[PayrollRow] = []
    totals = {k: Decimal(0) for k in ("base", "bonus", "deduction", "advance", "to_pay", "paid", "unpaid")}
    missing = 0
    for e in employees:
        rate = Decimal(e.pay_rate) if e.pay_rate is not None else None
        qty = int(pieces.get(e.id, (0,))[0] or 0)
        minutes, present, absent = attendance.get(e.id, (0, 0, 0))
        hours = Decimal(minutes or 0) / 60
        if rate is None:
            base = Decimal(0)
            missing += 1
        elif e.pay_type == PayType.PIECE:
            base = rate * qty
        elif e.pay_type == PayType.HOURLY:
            base = rate * hours
        else:
            base = rate
        bonus, deduction, advance = (Decimal(x or 0) for x in adjustments.get(e.id, (0, 0, 0)))
        accrued = base + bonus - deduction
        to_pay = accrued - advance
        payment = payments.get(e.id)
        for key, value in (("base", base), ("bonus", bonus), ("deduction", deduction), ("advance", advance), ("to_pay", to_pay)):
            totals[key] += value
        if payment:
            totals["paid"] += Decimal(payment.amount)
        elif to_pay > 0:
            totals["unpaid"] += to_pay
        rows.append(PayrollRow(
            employee_id=e.id, factory_id=e.factory_id, employee_code=e.employee_code, full_name=e.full_name,
            position=e.position, department=e.department, pay_type=e.pay_type,
            pay_rate=float(rate) if rate is not None else None, pieces=qty, hours=round(float(hours), 1),
            present_days=int(present or 0), absent_days=int(absent or 0),
            base=_money(base), bonus=_money(bonus), deduction=_money(deduction), advance=_money(advance),
            accrued=_money(accrued), to_pay=_money(to_pay),
            payment_id=payment.id if payment else None,
            paid_amount=_money(payment.amount) if payment else None,
            paid_at=payment.paid_at if payment else None,
        ))
    return PayrollReport(
        month=month, rows=rows,
        totals=PayrollTotals(employees=len(rows), missing_rate=missing, **{k: _money(v) for k, v in totals.items()}),
    )


def _employee(db: Session, actor: User, employee_id: int) -> Employee:
    e = db.get(Employee, employee_id)
    if e is None or not can_access(actor, e.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("Xodim topilmadi"))
    return e


def _ensure_unpaid(db: Session, employee_id: int, period: date) -> None:
    if db.scalar(select(PayrollPayment.id).where(PayrollPayment.employee_id == employee_id, PayrollPayment.period == period)):
        raise HTTPException(status.HTTP_409_CONFLICT, t("Bu oy uchun ish haqi to'langan — avval to'lovni bekor qiling"))


def _adjustment_out(a: PayrollAdjustment) -> AdjustmentOut:
    return AdjustmentOut(id=a.id, employee_id=a.employee_id, kind=a.kind, amount=_money(a.amount), note=a.note, created_at=a.created_at)


def list_adjustments(db: Session, actor: User, month: str, employee_id: int) -> list[AdjustmentOut]:
    start, _ = _period(month)
    _employee(db, actor, employee_id)
    rows = db.scalars(select(PayrollAdjustment).where(PayrollAdjustment.employee_id == employee_id, PayrollAdjustment.period == start)
                      .order_by(PayrollAdjustment.created_at, PayrollAdjustment.id))
    return [_adjustment_out(a) for a in rows]


def add_adjustment(db: Session, actor: User, data: AdjustmentCreate) -> AdjustmentOut:
    start, _ = _period(data.month)
    e = _employee(db, actor, data.employee_id)
    _ensure_unpaid(db, e.id, start)
    a = PayrollAdjustment(factory_id=e.factory_id, employee_id=e.id, period=start, kind=data.kind,
                          amount=Decimal(str(data.amount)).quantize(CENT), note=data.note, created_by_id=actor.id)
    db.add(a)
    db.flush()
    audit_service.record(db, actor, entity="payroll", entity_id=a.id, action=AuditAction.CREATE, factory_id=e.factory_id,
                         summary=f"{e.full_name}: {data.kind.value} {a.amount} ({data.month})")
    db.commit()
    db.refresh(a)
    return _adjustment_out(a)


def delete_adjustment(db: Session, actor: User, adjustment_id: int) -> None:
    a = db.get(PayrollAdjustment, adjustment_id)
    if a is None or not can_access(actor, a.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("Yozuv topilmadi"))
    _ensure_unpaid(db, a.employee_id, a.period)
    audit_service.record(db, actor, entity="payroll", entity_id=a.id, action=AuditAction.DELETE, factory_id=a.factory_id,
                         summary=f"{a.kind.value} {a.amount} o'chirildi ({a.period:%Y-%m})")
    db.delete(a)
    db.commit()


def pay(db: Session, actor: User, data: PaymentCreate) -> PayrollRow:
    start, _ = _period(data.month)
    e = _employee(db, actor, data.employee_id)
    _ensure_unpaid(db, e.id, start)
    row = report(db, actor, data.month, employee_id=e.id).rows[0]
    if row.to_pay < 0:
        raise HTTPException(status.HTTP_409_CONFLICT, t("To'lanadigan summa manfiy — avans hisoblangan ish haqidan ko'p"))
    payment = PayrollPayment(factory_id=e.factory_id, employee_id=e.id, period=start,
                             amount=Decimal(str(row.to_pay)).quantize(CENT), paid_by_id=actor.id)
    db.add(payment)
    db.flush()
    audit_service.record(db, actor, entity="payroll", entity_id=payment.id, action=AuditAction.STATUS, factory_id=e.factory_id,
                         summary=f"Ish haqi to'landi: {e.full_name}, {data.month}, {payment.amount}")
    db.commit()
    from app.services import employee_bot_service

    employee_bot_service.send_payslip(db, e.id, data.month)
    return report(db, actor, data.month, employee_id=e.id).rows[0]


def cancel_payment(db: Session, actor: User, payment_id: int) -> None:
    p = db.get(PayrollPayment, payment_id)
    if p is None or not can_access(actor, p.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("To'lov topilmadi"))
    audit_service.record(db, actor, entity="payroll", entity_id=p.id, action=AuditAction.DELETE, factory_id=p.factory_id,
                         summary=f"Ish haqi to'lovi bekor qilindi ({p.period:%Y-%m}, {p.amount})")
    db.delete(p)
    db.commit()
