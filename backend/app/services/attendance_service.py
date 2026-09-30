"""Davomat: kelish/ketish, kechikish va ishlagan vaqt, kelmagan kunlar, javob (ruxsat) so'rovlari.

Vaqtlar zavodning mahalliy vaqtida (settings.TIMEZONE_OFFSET_HOURS). Kechikish xodim smenasining
boshlanish vaqtiga nisbatan hisoblanadi (LATE_GRACE_MINUTES gacha kechikish hisobga olinmaydi).
Ishlagan vaqt = ketish − kelish; 4 soatdan ko'p ishlagan bo'lsa smenadagi tanaffus chegiriladi.
"""

from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import false, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.core.roles import Role
from app.core.scope import can_access, scoped
from app.models import Attendance, Employee, Factory, LeaveRequest, User
from app.models.attendance import AttendanceStatus, LeaveStatus, LeaveType
from app.models.audit import AuditAction
from app.models.resources import EmployeeStatus, Shift
from app.schemas.attendance import (
    AttendanceRecordOut,
    AttendanceUpsert,
    CheckIn,
    CheckOut,
    DailyBoard,
    DailyRow,
    DailySummary,
    EmployeeBrief,
    EmployeeMonthDetail,
    EmployeeMonthRow,
    LeaveBrief,
    LeaveCreate,
    LeaveDecision,
    LeaveOut,
    LeavePage,
    MonthlyReport,
)
from app.services import audit_service
from app.core.i18n import t
from app.services import employee_bot_service, telegram_service

ATTENDANCE_VIEW_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER, Role.QUALITY_MANAGER, Role.WAREHOUSE_MANAGER)
ATTENDANCE_EDITOR_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER)
LEAVE_APPROVER_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER)

BREAK_AFTER_MINUTES = 4 * 60

_LEAVE_TO_STATUS = {
    LeaveType.SICK: AttendanceStatus.SICK,
    LeaveType.VACATION: AttendanceStatus.VACATION,
}

ACTIVE_STATES = (EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE)


def local_now() -> datetime:
    return datetime.now(timezone(timedelta(hours=settings.TIMEZONE_OFFSET_HOURS)))


def _to_min(t: time) -> int:
    return t.hour * 60 + t.minute


def _span_minutes(start: time, end: time) -> int:
    """Kelishdan ketishgacha; ketish kichik bo'lsa — yarim tundan o'tgan (tungi smena)."""
    diff = _to_min(end) - _to_min(start)
    return diff + 24 * 60 if diff < 0 else diff


def _late_minutes(check_in: time, shift: Shift | None) -> int:
    if shift is None:
        return 0
    diff = _to_min(check_in) - _to_min(shift.start_time)
    if shift.end_time <= shift.start_time:
        if diff < -12 * 60:
            diff += 24 * 60
        elif diff > 12 * 60:
            diff -= 24 * 60
    return diff if diff > settings.LATE_GRACE_MINUTES else 0


def _worked_minutes(check_in: time | None, check_out: time | None, shift: Shift | None) -> int | None:
    if check_in is None or check_out is None:
        return None
    span = _span_minutes(check_in, check_out)
    if shift is not None and span > BREAK_AFTER_MINUTES:
        span -= shift.break_minutes
    return max(0, span)


def _parse_month(month: str | None) -> tuple[str, date, date]:
    if not month:
        today = local_now().date()
        month = f"{today.year:04d}-{today.month:02d}"
    try:
        start = datetime.strptime(month, "%Y-%m").date()
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Oy formati: YYYY-MM") from exc
    end = (start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    return month, start, end


def _brief(e: Employee) -> EmployeeBrief:
    return EmployeeBrief(
        id=e.id, employee_code=e.employee_code, full_name=e.full_name, phone=e.phone, position=e.position,
        department=e.department, shift_name=e.shift.name if e.shift else None,
        shift_start=e.shift.start_time if e.shift else None, shift_end=e.shift.end_time if e.shift else None,
    )


def _record_out(r: Attendance) -> AttendanceRecordOut:
    return AttendanceRecordOut(
        id=r.id, work_date=r.work_date, status=r.status, check_in=r.check_in, check_out=r.check_out,
        late_minutes=r.late_minutes or 0, worked_minutes=r.worked_minutes, note=r.note, leave_request_id=r.leave_request_id,
    )


def _leave_out(lr: LeaveRequest) -> LeaveOut:
    return LeaveOut(
        id=lr.id, employee=_brief(lr.employee), leave_type=lr.leave_type, start_date=lr.start_date, end_date=lr.end_date,
        start_time=lr.start_time, end_time=lr.end_time, days=(lr.end_date - lr.start_date).days + 1, reason=lr.reason,
        status=lr.status, decided_by_name=lr.decided_by.full_name if lr.decided_by else None, decided_at=lr.decided_at,
        decision_note=lr.decision_note, created_at=lr.created_at,
    )


def _load_employee(db: Session, actor: User, employee_id: int) -> Employee:
    e = db.scalar(select(Employee).options(selectinload(Employee.shift)).where(Employee.id == employee_id))
    if e is None or not can_access(actor, e.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Xodim topilmadi")
    return e


def _record(db: Session, employee_id: int, work_date: date) -> Attendance | None:
    return db.scalar(select(Attendance).where(Attendance.employee_id == employee_id, Attendance.work_date == work_date))


def _employees_query(actor: User, factory_id: int | None, *, search: str | None, department: str | None, shift_id: int | None):
    q = scoped(select(Employee), actor, Employee.factory_id, factory_id)
    if search:
        p = f"%{search.strip()}%"
        q = q.where(or_(Employee.full_name.ilike(p), Employee.employee_code.ilike(p), Employee.phone.ilike(p), Employee.position.ilike(p)))
    if department:
        q = q.where(Employee.department == department)
    if shift_id is not None:
        q = q.where(Employee.shift_id == shift_id)
    return q.options(selectinload(Employee.shift))


def _state(record: Attendance | None) -> str:
    if record is None:
        return "NOT_MARKED"
    if record.status == AttendanceStatus.PRESENT:
        return "LATE" if (record.late_minutes or 0) > 0 else "PRESENT"
    return record.status.value


def daily_board(
    db: Session,
    actor: User,
    *,
    day: date | None = None,
    search: str | None = None,
    department: str | None = None,
    shift_id: int | None = None,
    state: str | None = None,
    factory_id: int | None = None,
) -> DailyBoard:
    now = local_now()
    day = day or now.date()
    is_today = day == now.date()

    base = _employees_query(actor, factory_id, search=search, department=department, shift_id=shift_id)
    records = {
        r.employee_id: r
        for r in db.scalars(
            select(Attendance).where(Attendance.work_date == day, Attendance.employee_id.in_(select(base.subquery().c.id)))
        )
    }
    employees = db.scalars(
        base.where(
            or_(
                Employee.id.in_(list(records.keys())) if records else false(),
                (Employee.status.in_(ACTIVE_STATES)) & (or_(Employee.hire_date.is_(None), Employee.hire_date <= day)),
            )
        ).order_by(Employee.full_name, Employee.id)
    ).all()

    leaves: dict[int, LeaveRequest] = {}
    for lr in db.scalars(
        select(LeaveRequest)
        .where(
            LeaveRequest.employee_id.in_([e.id for e in employees] or [0]),
            LeaveRequest.status.in_((LeaveStatus.PENDING, LeaveStatus.APPROVED)),
            LeaveRequest.start_date <= day,
            LeaveRequest.end_date >= day,
        )
        .order_by(LeaveRequest.status)
    ):
        leaves.setdefault(lr.employee_id, lr)

    rows: list[DailyRow] = []
    summary = DailySummary()
    for e in employees:
        r = records.get(e.id)
        st = _state(r)
        at_work = bool(is_today and r and r.status == AttendanceStatus.PRESENT and r.check_in and not r.check_out)
        lr = leaves.get(e.id)
        row = DailyRow(
            employee=_brief(e),
            record=_record_out(r) if r else None,
            state=st,
            at_work=at_work,
            leave=LeaveBrief(id=lr.id, leave_type=lr.leave_type, status=lr.status, start_time=lr.start_time, end_time=lr.end_time, reason=lr.reason)
            if lr
            else None,
        )
        summary.total += 1
        if st in ("PRESENT", "LATE"):
            summary.present += 1
            summary.worked_minutes += r.worked_minutes or 0
        if st == "LATE":
            summary.late += 1
        if at_work:
            summary.at_work += 1
        if st == "ABSENT":
            summary.absent += 1
        if st in ("LEAVE", "VACATION"):
            summary.on_leave += 1
        if st == "SICK":
            summary.sick += 1
        if st == "NOT_MARKED":
            summary.not_marked += 1
        if state and not (st == state or (state == "PRESENT" and st == "LATE") or (state == "AT_WORK" and at_work)):
            continue
        rows.append(row)

    return DailyBoard(date=day, is_today=is_today, now=now.time().replace(second=0, microsecond=0) if is_today else None, rows=rows, summary=summary)


def check_in(db: Session, actor: User, data: CheckIn) -> AttendanceRecordOut:
    e = _load_employee(db, actor, data.employee_id)
    now = local_now()
    day = data.work_date or now.date()
    at = data.at or now.time().replace(second=0, microsecond=0)
    r = _record(db, e.id, day)
    if r is not None and r.status == AttendanceStatus.PRESENT and r.check_in is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, t("{name} bu kuni {time} da kelgan deb belgilangan", name=e.full_name, time=r.check_in.strftime('%H:%M')))
    if r is None:
        r = Attendance(factory_id=e.factory_id, employee_id=e.id, work_date=day, created_by_id=actor.id)
        db.add(r)
    r.status = AttendanceStatus.PRESENT
    r.check_in, r.check_out, r.worked_minutes = at, None, None
    r.late_minutes = _late_minutes(at, e.shift)
    r.leave_request_id = None
    if data.note:
        r.note = data.note
    db.commit()
    return _record_out(r)


def check_out(db: Session, actor: User, data: CheckOut) -> AttendanceRecordOut:
    e = _load_employee(db, actor, data.employee_id)
    now = local_now()
    day = data.work_date or now.date()
    r = _record(db, e.id, day)
    if r is None and data.work_date is None:
        prev = _record(db, e.id, day - timedelta(days=1))
        if prev is not None and prev.check_in is not None and prev.check_out is None:
            r = prev
    if r is None or r.status != AttendanceStatus.PRESENT or r.check_in is None:
        raise HTTPException(status.HTTP_409_CONFLICT, t("{name} kelgani belgilanmagan", name=e.full_name))
    if r.check_out is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, t("{name} {time} da ketgan deb belgilangan", name=e.full_name, time=r.check_out.strftime('%H:%M')))
    r.check_out = data.at or now.time().replace(second=0, microsecond=0)
    r.worked_minutes = _worked_minutes(r.check_in, r.check_out, e.shift)
    db.commit()
    return _record_out(r)


def upsert(db: Session, actor: User, data: AttendanceUpsert) -> AttendanceRecordOut:
    e = _load_employee(db, actor, data.employee_id)
    r = _record(db, e.id, data.work_date)
    created = r is None
    if created:
        r = Attendance(factory_id=e.factory_id, employee_id=e.id, work_date=data.work_date, created_by_id=actor.id)
        db.add(r)
    old = None if created else f"{r.status.value} {r.check_in or ''}–{r.check_out or ''}"
    r.status = data.status
    r.check_in, r.check_out = data.check_in, data.check_out
    r.late_minutes = _late_minutes(data.check_in, e.shift) if data.check_in else 0
    r.worked_minutes = _worked_minutes(data.check_in, data.check_out, e.shift)
    r.note = data.note
    r.leave_request_id = None
    db.flush()
    audit_service.record(
        db, actor, entity="attendance", entity_id=r.id, action=AuditAction.CREATE if created else AuditAction.UPDATE,
        summary=f"Davomat: {e.full_name}, {data.work_date.isoformat()} — {data.status.value}",
        factory_id=e.factory_id, changes=None if created else {"holat": [old, f"{r.status.value} {r.check_in or ''}–{r.check_out or ''}"]},
    )
    db.commit()
    return _record_out(r)


def delete_record(db: Session, actor: User, record_id: int) -> None:
    r = db.get(Attendance, record_id)
    if r is None or not can_access(actor, r.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Yozuv topilmadi")
    audit_service.record(db, actor, entity="attendance", entity_id=r.id, action=AuditAction.DELETE,
                         summary=f"Davomat yozuvi o'chirildi: {r.employee.full_name}, {r.work_date.isoformat()}", factory_id=r.factory_id)
    db.delete(r)
    db.commit()


def _accumulate(row: EmployeeMonthRow, r: Attendance) -> None:
    if r.status == AttendanceStatus.PRESENT:
        row.present_days += 1
        row.worked_minutes += r.worked_minutes or 0
        if (r.late_minutes or 0) > 0:
            row.late_days += 1
            row.late_minutes += r.late_minutes
    elif r.status == AttendanceStatus.ABSENT:
        row.absent_days += 1
    elif r.status == AttendanceStatus.LEAVE:
        row.leave_days += 1
    elif r.status == AttendanceStatus.SICK:
        row.sick_days += 1
    elif r.status == AttendanceStatus.VACATION:
        row.vacation_days += 1


def monthly_report(
    db: Session, actor: User, *, month: str | None = None, search: str | None = None, department: str | None = None,
    factory_id: int | None = None,
) -> MonthlyReport:
    month, start, end = _parse_month(month)
    base = _employees_query(actor, factory_id, search=search, department=department, shift_id=None)
    records = db.scalars(
        select(Attendance).where(
            Attendance.work_date >= start, Attendance.work_date <= end, Attendance.employee_id.in_(select(base.subquery().c.id))
        )
    ).all()
    with_records = {r.employee_id for r in records}
    employees = db.scalars(
        base.where(or_(Employee.id.in_(list(with_records)) if with_records else false(), Employee.status.in_(ACTIVE_STATES))).order_by(
            Employee.full_name, Employee.id
        )
    ).all()
    rows = {e.id: EmployeeMonthRow(employee=_brief(e)) for e in employees}
    for r in records:
        if r.employee_id in rows:
            _accumulate(rows[r.employee_id], r)
    return MonthlyReport(month=month, rows=list(rows.values()))


def employee_month(db: Session, actor: User, employee_id: int, month: str | None = None) -> EmployeeMonthDetail:
    e = _load_employee(db, actor, employee_id)
    month, start, end = _parse_month(month)
    records = db.scalars(
        select(Attendance)
        .where(Attendance.employee_id == e.id, Attendance.work_date >= start, Attendance.work_date <= end)
        .order_by(Attendance.work_date)
    ).all()
    totals = EmployeeMonthRow(employee=_brief(e))
    for r in records:
        _accumulate(totals, r)
    leaves = db.scalars(
        _leaves_query().where(LeaveRequest.employee_id == e.id, LeaveRequest.start_date <= end, LeaveRequest.end_date >= start)
    ).all()
    return EmployeeMonthDetail(
        employee=_brief(e), month=month, days=[_record_out(r) for r in records], leaves=[_leave_out(lr) for lr in leaves], totals=totals
    )


def _leaves_query():
    return (
        select(LeaveRequest)
        .options(selectinload(LeaveRequest.employee).selectinload(Employee.shift), selectinload(LeaveRequest.decided_by))
        .order_by(LeaveRequest.start_date.desc(), LeaveRequest.id.desc())
    )


def _load_leave(db: Session, actor: User, leave_id: int) -> LeaveRequest:
    lr = db.scalar(_leaves_query().where(LeaveRequest.id == leave_id))
    if lr is None or not can_access(actor, lr.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Javob so'rovi topilmadi")
    return lr


def list_leaves(
    db: Session,
    actor: User,
    *,
    status_: LeaveStatus | None = None,
    employee_id: int | None = None,
    search: str | None = None,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> LeavePage:
    q = scoped(_leaves_query(), actor, LeaveRequest.factory_id, factory_id)
    if employee_id is not None:
        q = q.where(LeaveRequest.employee_id == employee_id)
    if search:
        p = f"%{search.strip()}%"
        q = q.join(Employee, Employee.id == LeaveRequest.employee_id).where(
            or_(Employee.full_name.ilike(p), Employee.employee_code.ilike(p), Employee.phone.ilike(p), LeaveRequest.reason.ilike(p))
        )
    pending_q = q.where(LeaveRequest.status == LeaveStatus.PENDING)
    pending = db.scalar(select(func.count()).select_from(pending_q.order_by(None).subquery())) or 0
    if status_ is not None:
        q = q.where(LeaveRequest.status == status_)
    total = db.scalar(select(func.count()).select_from(q.order_by(None).subquery())) or 0
    rows = db.scalars(q.order_by(None).order_by((LeaveRequest.status != LeaveStatus.PENDING), LeaveRequest.start_date.desc(), LeaveRequest.id.desc()).offset(offset).limit(limit))
    return LeavePage(items=[_leave_out(lr) for lr in rows], total=total, pending=pending)


def _apply_leave(db: Session, lr: LeaveRequest, actor: User) -> None:
    """Tasdiqlangan to'liq kunlik javobni davomatga yozadi (o'sha kuni kelgan bo'lsa tegilmaydi)."""
    if lr.start_time is not None:
        return
    att_status = _LEAVE_TO_STATUS.get(lr.leave_type, AttendanceStatus.LEAVE)
    day = lr.start_date
    while day <= lr.end_date:
        r = _record(db, lr.employee_id, day)
        if r is None:
            db.add(
                Attendance(
                    factory_id=lr.factory_id, employee_id=lr.employee_id, work_date=day, status=att_status,
                    note=f"Javob: {lr.reason}"[:300], leave_request_id=lr.id, created_by_id=actor.id,
                )
            )
        elif not (r.status == AttendanceStatus.PRESENT and r.check_in is not None):
            r.status, r.check_in, r.check_out, r.late_minutes, r.worked_minutes = att_status, None, None, 0, None
            r.note, r.leave_request_id = f"Javob: {lr.reason}"[:300], lr.id
        day += timedelta(days=1)


def _unapply_leave(db: Session, lr: LeaveRequest) -> None:
    for r in db.scalars(select(Attendance).where(Attendance.leave_request_id == lr.id)):
        db.delete(r)


def _decide(db: Session, actor: User, lr: LeaveRequest, new_status: LeaveStatus, note: str | None) -> None:
    lr.status = new_status
    lr.decided_by_id = actor.id
    lr.decided_by = actor
    lr.decided_at = datetime.now(timezone.utc)
    lr.decision_note = note


def create_leave(db: Session, actor: User, data: LeaveCreate, *, via_bot: bool = False) -> LeaveOut:
    """via_bot — xodim o'zi Telegram'dan so'ragan (actor — zavod rahbari, audit izohida belgilanadi)."""
    e = _load_employee(db, actor, data.employee_id)
    overlap = db.scalar(
        select(LeaveRequest.id).where(
            LeaveRequest.employee_id == e.id,
            LeaveRequest.status.in_((LeaveStatus.PENDING, LeaveStatus.APPROVED)),
            LeaveRequest.start_date <= data.end_date,
            LeaveRequest.end_date >= data.start_date,
            LeaveRequest.start_time.is_(None),
        )
    )
    if overlap and data.start_time is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu kunlarga xodimning boshqa javob so'rovi bor")
    lr = LeaveRequest(
        factory_id=e.factory_id, employee_id=e.id, leave_type=data.leave_type, start_date=data.start_date, end_date=data.end_date,
        start_time=data.start_time, end_time=data.end_time, reason=data.reason, created_by_id=actor.id, status=LeaveStatus.PENDING,
    )
    db.add(lr)
    db.flush()
    summary = f"Javob so'rovi: {e.full_name}, {data.start_date.isoformat()}" + (
        f" — {data.end_date.isoformat()}" if data.end_date != data.start_date else ""
    )
    if via_bot:
        summary += " (xodim Telegram orqali so'radi)"
    if data.approve and actor.role in LEAVE_APPROVER_ROLES and not via_bot:
        _decide(db, actor, lr, LeaveStatus.APPROVED, None)
        _apply_leave(db, lr, actor)
        summary += " (darhol tasdiqlandi)"
    audit_service.record(db, actor, entity="leave_request", entity_id=lr.id, action=AuditAction.CREATE, summary=summary, factory_id=e.factory_id)
    db.commit()
    if lr.status == LeaveStatus.PENDING:
        period = data.start_date.strftime("%d.%m.%Y") + (f" — {data.end_date.strftime('%d.%m.%Y')}" if data.end_date != data.start_date else "")
        factory = db.get(Factory, e.factory_id)
        telegram_service.send(factory, "🙋 Javob so'rovi: <b>{name}</b>, {period}\nSabab: {reason}\nTasdiqlash: Davomat → Javob so'rovlari",
                              reply_markup=employee_bot_service.decision_keyboard(lr.id, (factory.telegram_lang if factory else None) or "uz"),
                              name=e.full_name, period=period, reason=data.reason or "—")
    return _leave_out(_load_leave(db, actor, lr.id))


def approve_leave(db: Session, actor: User, leave_id: int, data: LeaveDecision) -> LeaveOut:
    lr = _load_leave(db, actor, leave_id)
    if lr.status != LeaveStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "So'rov allaqachon ko'rib chiqilgan")
    _decide(db, actor, lr, LeaveStatus.APPROVED, data.note)
    _apply_leave(db, lr, actor)
    audit_service.record(db, actor, entity="leave_request", entity_id=lr.id, action=AuditAction.UPDATE,
                         summary=f"Javob berildi: {lr.employee.full_name}", factory_id=lr.factory_id)
    db.commit()
    employee_bot_service.notify_decision(db, lr)
    return _leave_out(_load_leave(db, actor, lr.id))


def reject_leave(db: Session, actor: User, leave_id: int, data: LeaveDecision) -> LeaveOut:
    lr = _load_leave(db, actor, leave_id)
    if lr.status != LeaveStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "So'rov allaqachon ko'rib chiqilgan")
    _decide(db, actor, lr, LeaveStatus.REJECTED, data.note)
    audit_service.record(db, actor, entity="leave_request", entity_id=lr.id, action=AuditAction.UPDATE,
                         summary=f"Javob rad etildi: {lr.employee.full_name}", factory_id=lr.factory_id)
    db.commit()
    employee_bot_service.notify_decision(db, lr)
    return _leave_out(_load_leave(db, actor, lr.id))


def delete_leave(db: Session, actor: User, leave_id: int) -> None:
    """So'rovni bekor qilish: tasdiqlangan bo'lsa davomatga qo'yilgan "javob" kunlari ham olib tashlanadi."""
    lr = _load_leave(db, actor, leave_id)
    _unapply_leave(db, lr)
    audit_service.record(db, actor, entity="leave_request", entity_id=lr.id, action=AuditAction.DELETE,
                         summary=f"Javob so'rovi bekor qilindi: {lr.employee.full_name}, {lr.start_date.isoformat()}", factory_id=lr.factory_id)
    db.delete(lr)
    db.commit()
