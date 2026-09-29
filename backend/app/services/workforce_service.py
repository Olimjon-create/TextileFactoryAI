"""Xodimlar, smenalar va ishlab chiqarish liniyalari."""

import re
from datetime import datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.core.scope import can_access, resolve_factory_id, scoped
from app.models import Employee, Machine, MachineMaintenance, ProductionLine, ProductionLog, Shift, User
from app.models.audit import AuditAction
from app.models.resources import EmployeeStatus, MachineStatus
from app.schemas.resources import (
    Brief,
    EmployeeCreate,
    EmployeeOut,
    EmployeePage,
    EmployeeUpdate,
    LineCreate,
    LineOut,
    LineUpdate,
    ShiftCreate,
    ShiftOut,
    ShiftUpdate,
)
from app.services import audit_service
from app.core.i18n import t

WORKFORCE_VIEW_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER, Role.QUALITY_MANAGER)
WORKFORCE_EDITOR_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER)
PAY_VIEW_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER)

EMPLOYEE_CODE_PREFIX = "EMP-"
_CODE_RE = re.compile(r"^EMP-(\d+)$")


def _conflict(message: str) -> HTTPException:
    return HTTPException(status.HTTP_409_CONFLICT, message)


def _get(db: Session, actor: User, model, obj_id: int, not_found: str):
    obj = db.get(model, obj_id)
    if obj is None or not can_access(actor, obj.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, not_found)
    return obj


def _same_factory(db: Session, model, obj_id: int | None, factory_id: int, label: str) -> None:
    """Bog'lanayotgan liniya/smena/foydalanuvchi shu zavodniki bo'lishi shart."""
    if obj_id is None:
        return
    obj = db.get(model, obj_id)
    if obj is None or obj.factory_id != factory_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("{label} topilmadi", label=label))


def list_lines(db: Session, actor: User, *, include_inactive: bool = False, factory_id: int | None = None) -> list[LineOut]:
    emp = (
        select(Employee.line_id, func.count().label("n"))
        .where(Employee.status == EmployeeStatus.ACTIVE, Employee.line_id.is_not(None))
        .group_by(Employee.line_id)
        .subquery()
    )
    mach = (
        select(
            Machine.line_id,
            func.count().label("n"),
            func.sum(case((Machine.status.in_((MachineStatus.BROKEN, MachineStatus.MAINTENANCE)), 1), else_=0)).label("down"),
        )
        .where(Machine.is_active.is_(True), Machine.line_id.is_not(None))
        .group_by(Machine.line_id)
        .subquery()
    )
    query = scoped(
        select(ProductionLine, func.coalesce(emp.c.n, 0), func.coalesce(mach.c.n, 0), func.coalesce(mach.c.down, 0))
        .outerjoin(emp, emp.c.line_id == ProductionLine.id)
        .outerjoin(mach, mach.c.line_id == ProductionLine.id),
        actor,
        ProductionLine.factory_id,
        factory_id,
    )
    if not include_inactive:
        query = query.where(ProductionLine.is_active.is_(True))
    result = []
    for line, n_emp, n_mach, n_down in db.execute(query.order_by(ProductionLine.stage, ProductionLine.code)):
        out = LineOut.model_validate(line)
        out.employees_count, out.machines_count, out.machines_down = n_emp, n_mach, int(n_down)
        result.append(out)
    return result


def _line_code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None) -> None:
    q = select(ProductionLine.id).where(ProductionLine.factory_id == factory_id, ProductionLine.code == code)
    if exclude_id:
        q = q.where(ProductionLine.id != exclude_id)
    if db.scalar(q):
        raise _conflict(t("'{code}' kodli liniya allaqachon mavjud", code=code))


def create_line(db: Session, actor: User, data: LineCreate) -> LineOut:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    _line_code_free(db, factory_id, data.code)
    line = ProductionLine(factory_id=factory_id, **data.model_dump(exclude={"factory_id"}))
    db.add(line)
    db.flush()
    audit_service.record(db, actor, entity="production_line", entity_id=line.id, action=AuditAction.CREATE,
                         summary=f"Liniya qo'shildi: {line.code} — {line.name}", factory_id=factory_id)
    db.commit()
    return LineOut.model_validate(line)


def update_line(db: Session, actor: User, line_id: int, data: LineUpdate) -> LineOut:
    line = _get(db, actor, ProductionLine, line_id, "Liniya topilmadi")
    values = data.model_dump(exclude_unset=True)
    values = {k: v for k, v in values.items() if v is not None or k == "capacity_per_shift"}
    if values.get("code"):
        _line_code_free(db, line.factory_id, values["code"], line.id)
    changes = audit_service.diff(line, values)
    for k, v in values.items():
        setattr(line, k, v)
    if changes:
        audit_service.record(db, actor, entity="production_line", entity_id=line.id, action=AuditAction.UPDATE,
                             summary=f"Liniya o'zgartirildi: {line.code}", factory_id=line.factory_id, changes=changes)
    db.commit()
    return LineOut.model_validate(line)


def delete_line(db: Session, actor: User, line_id: int) -> None:
    line = _get(db, actor, ProductionLine, line_id, "Liniya topilmadi")
    audit_service.record(db, actor, entity="production_line", entity_id=line.id, action=AuditAction.DELETE,
                         summary=f"Liniya o'chirildi: {line.code}", factory_id=line.factory_id)
    db.delete(line)
    db.commit()


def _work_minutes(shift: Shift) -> tuple[int, bool]:
    start = datetime.combine(datetime.min.date(), shift.start_time)
    end = datetime.combine(datetime.min.date(), shift.end_time)
    night = end <= start
    if night:
        end += timedelta(days=1)
    return max(0, int((end - start).total_seconds() // 60) - shift.break_minutes), night


def _shift_out(shift: Shift, employees: int = 0) -> ShiftOut:
    out = ShiftOut.model_validate(shift)
    out.work_minutes, out.is_night = _work_minutes(shift)
    out.employees_count = employees
    return out


def list_shifts(db: Session, actor: User, *, include_inactive: bool = False, factory_id: int | None = None) -> list[ShiftOut]:
    emp = (
        select(Employee.shift_id, func.count().label("n"))
        .where(Employee.status == EmployeeStatus.ACTIVE, Employee.shift_id.is_not(None))
        .group_by(Employee.shift_id)
        .subquery()
    )
    query = scoped(
        select(Shift, func.coalesce(emp.c.n, 0)).outerjoin(emp, emp.c.shift_id == Shift.id), actor, Shift.factory_id, factory_id
    )
    if not include_inactive:
        query = query.where(Shift.is_active.is_(True))
    return [_shift_out(s, n) for s, n in db.execute(query.order_by(Shift.start_time))]


def _check_shift_minutes(shift: Shift) -> None:
    if _work_minutes(shift)[0] <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tanaffus smena davomiyligidan uzun bo'lmasin")


def create_shift(db: Session, actor: User, data: ShiftCreate) -> ShiftOut:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    shift = Shift(factory_id=factory_id, **data.model_dump(exclude={"factory_id"}))
    _check_shift_minutes(shift)
    db.add(shift)
    db.flush()
    audit_service.record(db, actor, entity="shift", entity_id=shift.id, action=AuditAction.CREATE,
                         summary=f"Smena qo'shildi: {shift.name}", factory_id=factory_id)
    db.commit()
    return _shift_out(shift)


def update_shift(db: Session, actor: User, shift_id: int, data: ShiftUpdate) -> ShiftOut:
    shift = _get(db, actor, Shift, shift_id, "Smena topilmadi")
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    changes = audit_service.diff(shift, values)
    for k, v in values.items():
        setattr(shift, k, v)
    if shift.start_time == shift.end_time:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Boshlanish va tugash vaqti bir xil bo'lmasin")
    _check_shift_minutes(shift)
    if changes:
        audit_service.record(db, actor, entity="shift", entity_id=shift.id, action=AuditAction.UPDATE,
                             summary=f"Smena o'zgartirildi: {shift.name}", factory_id=shift.factory_id, changes=changes)
    db.commit()
    return _shift_out(shift)


def delete_shift(db: Session, actor: User, shift_id: int) -> None:
    shift = _get(db, actor, Shift, shift_id, "Smena topilmadi")
    audit_service.record(db, actor, entity="shift", entity_id=shift.id, action=AuditAction.DELETE,
                         summary=f"Smena o'chirildi: {shift.name}", factory_id=shift.factory_id)
    db.delete(shift)
    db.commit()


def _can_see_pay(actor: User) -> bool:
    return actor.role in PAY_VIEW_ROLES


def _employee_out(e: Employee, actor: User) -> EmployeeOut:
    return EmployeeOut(
        id=e.id, factory_id=e.factory_id, employee_code=e.employee_code, full_name=e.full_name, phone=e.phone,
        position=e.position, department=e.department,
        line=Brief(id=e.line.id, code=e.line.code, name=e.line.name) if e.line else None,
        shift=Brief(id=e.shift.id, name=e.shift.name) if e.shift else None,
        user_id=e.user_id, user_email=e.user.email if e.user else None, hire_date=e.hire_date, pay_type=e.pay_type,
        pay_rate=float(e.pay_rate) if e.pay_rate is not None and _can_see_pay(actor) else None,
        daily_norm=e.daily_norm, status=e.status, notes=e.notes, created_at=e.created_at,
    )


def _load_employee(db: Session, actor: User, employee_id: int) -> Employee:
    e = db.scalar(
        select(Employee)
        .options(selectinload(Employee.line), selectinload(Employee.shift), selectinload(Employee.user))
        .where(Employee.id == employee_id)
    )
    if e is None or not can_access(actor, e.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Xodim topilmadi")
    return e


def _next_employee_code(db: Session, factory_id: int) -> str:
    codes = db.scalars(select(Employee.employee_code).where(Employee.factory_id == factory_id, Employee.employee_code.like(f"{EMPLOYEE_CODE_PREFIX}%")))
    numbers = [int(m.group(1)) for c in codes if (m := _CODE_RE.match(c))]
    return f"{EMPLOYEE_CODE_PREFIX}{max(numbers, default=0) + 1:05d}"


def _employee_code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None) -> None:
    q = select(Employee.id).where(Employee.factory_id == factory_id, Employee.employee_code == code)
    if exclude_id:
        q = q.where(Employee.id != exclude_id)
    if db.scalar(q):
        raise _conflict(t("'{code}' tabel raqami band", code=code))


def _validate_links(db: Session, factory_id: int, values: dict, exclude_id: int | None = None) -> None:
    _same_factory(db, ProductionLine, values.get("line_id"), factory_id, "Liniya")
    _same_factory(db, Shift, values.get("shift_id"), factory_id, "Smena")
    user_id = values.get("user_id")
    if user_id is not None:
        _same_factory(db, User, user_id, factory_id, "Foydalanuvchi")
        q = select(Employee.id).where(Employee.user_id == user_id)
        if exclude_id:
            q = q.where(Employee.id != exclude_id)
        if db.scalar(q):
            raise _conflict("Bu akkaunt boshqa xodimga bog'langan")


def _guard_pay(actor: User, values: dict) -> None:
    if not _can_see_pay(actor) and ({"pay_rate", "pay_type"} & values.keys()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ish haqi ma'lumotlarini o'zgartirishga ruxsat yo'q")


def list_employees(
    db: Session,
    actor: User,
    *,
    search: str | None = None,
    department: str | None = None,
    line_id: int | None = None,
    shift_id: int | None = None,
    status_: EmployeeStatus | None = None,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> EmployeePage:
    query = scoped(select(Employee), actor, Employee.factory_id, factory_id)
    if search:
        p = f"%{search.strip()}%"
        query = query.where(or_(Employee.full_name.ilike(p), Employee.employee_code.ilike(p), Employee.phone.ilike(p), Employee.position.ilike(p)))
    if department:
        query = query.where(Employee.department == department)
    if line_id is not None:
        query = query.where(Employee.line_id == line_id)
    if shift_id is not None:
        query = query.where(Employee.shift_id == shift_id)
    if status_ is not None:
        query = query.where(Employee.status == status_)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.options(selectinload(Employee.line), selectinload(Employee.shift), selectinload(Employee.user))
        .order_by(Employee.full_name, Employee.id)
        .offset(offset)
        .limit(limit)
    )
    return EmployeePage(items=[_employee_out(e, actor) for e in rows], total=total)


def get_employee(db: Session, actor: User, employee_id: int) -> EmployeeOut:
    return _employee_out(_load_employee(db, actor, employee_id), actor)


def create_employee(db: Session, actor: User, data: EmployeeCreate) -> EmployeeOut:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    values = data.model_dump(exclude={"factory_id"}, exclude_unset=False)
    _guard_pay(actor, data.model_dump(exclude_unset=True))
    _validate_links(db, factory_id, values)
    code = values.pop("employee_code") or _next_employee_code(db, factory_id)
    _employee_code_free(db, factory_id, code)
    employee = Employee(factory_id=factory_id, employee_code=code, **values)
    db.add(employee)
    db.flush()
    audit_service.record(db, actor, entity="employee", entity_id=employee.id, action=AuditAction.CREATE,
                         summary=f"Xodim qo'shildi: {code} — {employee.full_name}", factory_id=factory_id)
    db.commit()
    return get_employee(db, actor, employee.id)


_NULLABLE = {"phone", "position", "line_id", "shift_id", "user_id", "hire_date", "pay_rate", "daily_norm", "notes"}


def update_employee(db: Session, actor: User, employee_id: int, data: EmployeeUpdate) -> EmployeeOut:
    employee = _load_employee(db, actor, employee_id)
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k in _NULLABLE}
    _guard_pay(actor, values)
    _validate_links(db, employee.factory_id, values, exclude_id=employee.id)
    if values.get("employee_code"):
        _employee_code_free(db, employee.factory_id, values["employee_code"], employee.id)
    changes = audit_service.diff(employee, values)
    for k, v in values.items():
        setattr(employee, k, v)
    if changes:
        if "pay_rate" in changes:
            changes["pay_rate"] = ["***", "***"]
        audit_service.record(db, actor, entity="employee", entity_id=employee.id, action=AuditAction.UPDATE,
                             summary=f"Xodim o'zgartirildi: {employee.employee_code} — {employee.full_name}",
                             factory_id=employee.factory_id, changes=changes)
    db.commit()
    db.expire(employee)
    return get_employee(db, actor, employee.id)


def delete_employee(db: Session, actor: User, employee_id: int) -> None:
    employee = _load_employee(db, actor, employee_id)
    if db.scalar(select(ProductionLog.id).where(ProductionLog.employee_id == employee.id).limit(1)) is not None or db.scalar(
        select(MachineMaintenance.id).where(MachineMaintenance.technician_id == employee.id).limit(1)
    ) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Xodimning ish tarixi (KPI, ta'mir) bor — o'chirish o'rniga holatini «Bo'shagan» qiling")
    audit_service.record(db, actor, entity="employee", entity_id=employee.id, action=AuditAction.DELETE,
                         summary=f"Xodim o'chirildi: {employee.employee_code} — {employee.full_name}", factory_id=employee.factory_id)
    db.delete(employee)
    db.commit()
