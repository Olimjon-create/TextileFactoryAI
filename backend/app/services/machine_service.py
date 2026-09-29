"""Mashinalar: holat (Working/Idle/Broken/Maintenance) tarixi, downtime, texnik xizmat jadvali, ta'mirlash tarixi.

Holat faqat change_status() orqali o'zgaradi: oldingi davr yopiladi (ended_at), yangisi ochiladi.
Downtime va availability shu davrlardan hisoblanadi — alohida saqlanmaydi.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.core.scope import can_access, resolve_factory_id, scoped
from app.models import Employee, Machine, MachineMaintenance, MachineStatusLog, ProductionLine, User
from app.models.audit import AuditAction
from app.models.resources import EmployeeStatus, MachineStatus, MaintenanceKind
from app.schemas.resources import (
    Brief,
    MachineCreate,
    MachineDetail,
    MachineOut,
    MachinePage,
    MachineStats,
    MachineStatusChange,
    MachineUpdate,
    MaintenanceCreate,
    MaintenanceOut,
    ResourcesSummary,
    StatusPeriod,
)
from app.services import audit_service
from app.core.i18n import t
from app.services import telegram_service

MACHINE_VIEW_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER, Role.QUALITY_MANAGER)
MACHINE_EDITOR_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER)

DOWN_STATUSES = (MachineStatus.BROKEN, MachineStatus.MAINTENANCE)
MAINTENANCE_WARN_DAYS = 7  # texnik xizmatga shuncha kun qolganda "yaqinlashdi"
STATS_PERIOD_DAYS = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite tz'siz qaytaradi — UTC deb olamiz (PostgreSQL'da tz bor)."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _minutes(a: datetime, b: datetime) -> int:
    return max(0, int((b - a).total_seconds() // 60))


# ---------- texnik xizmat muddati ----------


def next_maintenance(m: Machine) -> date | None:
    if not m.maintenance_interval_days:
        return None
    base = m.last_maintenance_date or m.purchase_date or _aware(m.created_at).date()
    return base + timedelta(days=m.maintenance_interval_days)


def _machine_out(m: Machine, today: date | None = None) -> MachineOut:
    today = today or date.today()
    nxt = next_maintenance(m) if m.is_active else None
    return MachineOut(
        id=m.id, factory_id=m.factory_id, code=m.code, name=m.name, machine_type=m.machine_type, brand=m.brand,
        model=m.model, serial_number=m.serial_number,
        line=Brief(id=m.line.id, code=m.line.code, name=m.line.name) if m.line else None,
        status=m.status, status_since=_aware(m.status_since), purchase_date=m.purchase_date,
        maintenance_interval_days=m.maintenance_interval_days, last_maintenance_date=m.last_maintenance_date,
        next_maintenance_date=nxt,
        maintenance_overdue=nxt is not None and nxt < today,
        maintenance_due_soon=nxt is not None and today <= nxt <= today + timedelta(days=MAINTENANCE_WARN_DAYS),
        notes=m.notes, is_active=m.is_active, created_at=m.created_at,
    )


# ---------- holat tarixi ----------


def _open_period(db: Session, m: Machine, new_status: MachineStatus, at: datetime, actor: User | None, reason: str | None) -> None:
    db.add(MachineStatusLog(factory_id=m.factory_id, machine_id=m.id, status=new_status, started_at=at, reason=reason,
                            created_by_id=actor.id if actor else None))


def _stats(db: Session, machine_ids: list[int], days: int = STATS_PERIOD_DAYS) -> dict[int, MachineStats]:
    now = _now()
    since = now - timedelta(days=days)
    period = days * 24 * 60
    result = {mid: {"BROKEN": 0, "MAINTENANCE": 0, "WORKING": 0, "breakdowns": 0, "cost": Decimal(0)} for mid in machine_ids}
    if not machine_ids:
        return {}
    logs = db.scalars(
        select(MachineStatusLog).where(
            MachineStatusLog.machine_id.in_(machine_ids),
            or_(MachineStatusLog.ended_at.is_(None), MachineStatusLog.ended_at >= since),
        )
    )
    for log in logs:
        start, end = max(_aware(log.started_at), since), min(_aware(log.ended_at) or now, now)
        mins = _minutes(start, end)
        r = result[log.machine_id]
        if log.status.value in ("BROKEN", "MAINTENANCE", "WORKING"):
            r[log.status.value] += mins
        if log.status == MachineStatus.BROKEN and _aware(log.started_at) >= since:
            r["breakdowns"] += 1
    costs = db.execute(
        select(MachineMaintenance.machine_id, func.coalesce(func.sum(MachineMaintenance.cost), 0))
        .where(MachineMaintenance.machine_id.in_(machine_ids), MachineMaintenance.performed_at >= since)
        .group_by(MachineMaintenance.machine_id)
    ).all()
    for mid, cost in costs:
        result[mid]["cost"] = Decimal(str(cost))
    out = {}
    for mid, r in result.items():
        down = r["BROKEN"] + r["MAINTENANCE"]
        out[mid] = MachineStats(
            period_days=days, downtime_minutes=down, broken_minutes=r["BROKEN"], maintenance_minutes=r["MAINTENANCE"],
            working_minutes=r["WORKING"], availability_pct=round(100 * (period - down) / period, 1),
            breakdowns=r["breakdowns"], repair_cost=float(r["cost"]),
        )
    return out


# ---------- CRUD ----------


def _load(db: Session, actor: User, machine_id: int) -> Machine:
    m = db.scalar(select(Machine).options(selectinload(Machine.line)).where(Machine.id == machine_id))
    if m is None or not can_access(actor, m.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mashina topilmadi")
    return m


def _code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None) -> None:
    q = select(Machine.id).where(Machine.factory_id == factory_id, Machine.code == code)
    if exclude_id:
        q = q.where(Machine.id != exclude_id)
    if db.scalar(q):
        raise HTTPException(status.HTTP_409_CONFLICT, t("'{code}' inventar raqami band", code=code))


def _check_line(db: Session, line_id: int | None, factory_id: int) -> None:
    if line_id is None:
        return
    line = db.get(ProductionLine, line_id)
    if line is None or line.factory_id != factory_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Liniya topilmadi")


def list_machines(
    db: Session,
    actor: User,
    *,
    search: str | None = None,
    status_: MachineStatus | None = None,
    machine_type: str | None = None,
    line_id: int | None = None,
    maintenance: str | None = None,  # overdue | due_soon
    is_active: bool | None = True,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> MachinePage:
    query = scoped(select(Machine), actor, Machine.factory_id, factory_id)
    if search:
        p = f"%{search.strip()}%"
        query = query.where(or_(Machine.code.ilike(p), Machine.name.ilike(p), Machine.brand.ilike(p), Machine.serial_number.ilike(p)))
    if status_ is not None:
        query = query.where(Machine.status == status_)
    if machine_type:
        query = query.where(Machine.machine_type == machine_type)
    if line_id is not None:
        query = query.where(Machine.line_id == line_id)
    if is_active is not None:
        query = query.where(Machine.is_active.is_(is_active))
    query = query.options(selectinload(Machine.line)).order_by(Machine.code)
    if maintenance in ("overdue", "due_soon"):
        # Texnik xizmat sanasi hisoblanadigan qiymat — Python'da filtrlaymiz (mashinalar soni cheklangan)
        items = [_machine_out(m) for m in db.scalars(query)]
        items = [i for i in items if (i.maintenance_overdue if maintenance == "overdue" else i.maintenance_due_soon)]
        return MachinePage(items=items[offset : offset + limit], total=len(items))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    return MachinePage(items=[_machine_out(m) for m in db.scalars(query.offset(offset).limit(limit))], total=total)


def get_machine(db: Session, actor: User, machine_id: int) -> MachineDetail:
    m = _load(db, actor, machine_id)
    history = db.scalars(
        select(MachineStatusLog).options(selectinload(MachineStatusLog.created_by))
        .where(MachineStatusLog.machine_id == m.id).order_by(MachineStatusLog.started_at.desc(), MachineStatusLog.id.desc()).limit(50)
    )
    now = _now()
    periods = [
        StatusPeriod(
            id=h.id, status=h.status, started_at=_aware(h.started_at), ended_at=_aware(h.ended_at),
            duration_minutes=_minutes(_aware(h.started_at), _aware(h.ended_at) or now), reason=h.reason,
            created_by_name=h.created_by.full_name if h.created_by else None,
        )
        for h in history
    ]
    records = db.scalars(
        select(MachineMaintenance).options(selectinload(MachineMaintenance.technician))
        .where(MachineMaintenance.machine_id == m.id).order_by(MachineMaintenance.performed_at.desc()).limit(100)
    )
    maintenance = [
        MaintenanceOut(
            id=r.id, kind=r.kind, performed_at=_aware(r.performed_at), description=r.description, parts_used=r.parts_used,
            duration_minutes=r.duration_minutes, cost=float(r.cost) if r.cost is not None else None,
            technician=Brief(id=r.technician.id, code=r.technician.employee_code, name=r.technician.full_name) if r.technician else None,
            technician_name=r.technician_name, created_at=r.created_at,
        )
        for r in records
    ]
    return MachineDetail(**_machine_out(m).model_dump(), stats=_stats(db, [m.id])[m.id], history=periods, maintenance=maintenance)


def create_machine(db: Session, actor: User, data: MachineCreate) -> MachineDetail:
    factory_id = resolve_factory_id(db, actor, data.factory_id)
    _code_free(db, factory_id, data.code)
    _check_line(db, data.line_id, factory_id)
    now = _now()
    m = Machine(factory_id=factory_id, status_since=now, **data.model_dump(exclude={"factory_id"}))
    db.add(m)
    db.flush()
    _open_period(db, m, m.status, now, actor, "Ro'yxatga olindi")
    audit_service.record(db, actor, entity="machine", entity_id=m.id, action=AuditAction.CREATE,
                         summary=f"Mashina qo'shildi: {m.code} — {m.name}", factory_id=factory_id)
    db.commit()
    return get_machine(db, actor, m.id)


_NULLABLE = {"brand", "model", "serial_number", "line_id", "purchase_date", "maintenance_interval_days", "last_maintenance_date", "notes"}


def update_machine(db: Session, actor: User, machine_id: int, data: MachineUpdate) -> MachineDetail:
    m = _load(db, actor, machine_id)
    values = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k in _NULLABLE}
    if values.get("code"):
        _code_free(db, m.factory_id, values["code"], m.id)
    if "line_id" in values:
        _check_line(db, values["line_id"], m.factory_id)
    changes = audit_service.diff(m, values)
    for k, v in values.items():
        setattr(m, k, v)
    if changes:
        audit_service.record(db, actor, entity="machine", entity_id=m.id, action=AuditAction.UPDATE,
                             summary=f"Mashina o'zgartirildi: {m.code}", factory_id=m.factory_id, changes=changes)
    db.commit()
    db.expire(m)  # liniya bog'lanishi yangidan yuklansin
    return get_machine(db, actor, m.id)


def delete_machine(db: Session, actor: User, machine_id: int) -> None:
    m = _load(db, actor, machine_id)
    has_history = db.scalar(select(MachineMaintenance.id).where(MachineMaintenance.machine_id == m.id).limit(1)) or (
        db.scalar(select(func.count()).select_from(MachineStatusLog).where(MachineStatusLog.machine_id == m.id)) or 0
    ) > 1
    if has_history:
        raise HTTPException(status.HTTP_409_CONFLICT, "Mashinaning ish/ta'mir tarixi bor — o'chirish o'rniga nofaol qiling")
    audit_service.record(db, actor, entity="machine", entity_id=m.id, action=AuditAction.DELETE,
                         summary=f"Mashina o'chirildi: {m.code} — {m.name}", factory_id=m.factory_id)
    db.delete(m)
    db.commit()


# ---------- holat va texnik xizmat ----------


def _apply_status(db: Session, actor: User, m: Machine, new_status: MachineStatus, reason: str | None, at: datetime) -> None:
    if new_status == m.status:
        raise HTTPException(status.HTTP_409_CONFLICT, "Mashina allaqachon shu holatda")
    open_log = db.scalar(
        select(MachineStatusLog).where(MachineStatusLog.machine_id == m.id, MachineStatusLog.ended_at.is_(None))
        .order_by(MachineStatusLog.started_at.desc())
    )
    if open_log is not None:
        open_log.ended_at = at
    old = m.status
    m.status, m.status_since = new_status, at
    _open_period(db, m, new_status, at, actor, reason)
    audit_service.record(db, actor, entity="machine", entity_id=m.id, action=AuditAction.STATUS,
                         summary=f"Mashina {m.code}: {old.value} → {new_status.value}" + (f" ({reason})" if reason else ""),
                         factory_id=m.factory_id, changes={"status": [old.value, new_status.value]})


def change_status(db: Session, actor: User, machine_id: int, data: MachineStatusChange) -> MachineDetail:
    m = _load(db, actor, machine_id)
    if not m.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Nofaol mashinaning holati o'zgartirilmaydi")
    if data.status == MachineStatus.BROKEN and not data.reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Buzilish sababini yozing")
    _apply_status(db, actor, m, data.status, data.reason, _now())
    db.commit()
    if data.status == MachineStatus.BROKEN:
        telegram_service.notify(db, m.factory_id, "🔧 Mashina <b>{code}</b> {name} buzildi\nSabab: {reason}\nBelgiladi: {user}",
                                code=m.code, name=m.name, reason=data.reason or "—", user=actor.full_name)
    return get_machine(db, actor, m.id)


def add_maintenance(db: Session, actor: User, machine_id: int, data: MaintenanceCreate) -> MachineDetail:
    m = _load(db, actor, machine_id)
    performed_at = _aware(data.performed_at) or _now()
    if performed_at > _now() + timedelta(minutes=5):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Kelajakdagi sana bo'lmasin")
    if data.technician_id is not None:
        tech = db.get(Employee, data.technician_id)
        if tech is None or tech.factory_id != m.factory_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Xodim topilmadi")
    record = MachineMaintenance(
        factory_id=m.factory_id, machine_id=m.id, created_by_id=actor.id, performed_at=performed_at,
        **data.model_dump(exclude={"set_status", "performed_at"}),
    )
    db.add(record)
    # Rejali xizmat keyingi xizmat sanasini suradi
    if data.kind == MaintenanceKind.PREVENTIVE and (m.last_maintenance_date is None or performed_at.date() >= m.last_maintenance_date):
        m.last_maintenance_date = performed_at.date()
    db.flush()
    kind = "Texnik xizmat" if data.kind == MaintenanceKind.PREVENTIVE else "Ta'mirlash"
    audit_service.record(db, actor, entity="machine", entity_id=m.id, action=AuditAction.CREATE,
                         summary=f"{kind}: {m.code} — {data.description[:120]}", factory_id=m.factory_id)
    if data.set_status is not None and data.set_status != m.status:
        _apply_status(db, actor, m, data.set_status, f"{kind} yakunlandi", _now())
    db.commit()
    return get_machine(db, actor, m.id)


# ---------- umumiy ko'rsatkichlar ----------


def summary(db: Session, actor: User, factory_id: int | None = None) -> ResourcesSummary:
    emp = scoped(select(Employee.status, Employee.department, func.count()), actor, Employee.factory_id, factory_id).group_by(Employee.status, Employee.department)
    active = on_leave = 0
    by_dept: dict[str, int] = {}
    for st, dept, n in db.execute(emp):
        if st == EmployeeStatus.ACTIVE:
            active += n
            by_dept[dept.value] = by_dept.get(dept.value, 0) + n
        elif st == EmployeeStatus.ON_LEAVE:
            on_leave += n
    machines = list(db.scalars(scoped(select(Machine).where(Machine.is_active.is_(True)), actor, Machine.factory_id, factory_id)))
    by_status = {s.value: 0 for s in MachineStatus}
    overdue = due_soon = 0
    for m in machines:
        by_status[m.status.value] += 1
        out = _machine_out(m)
        overdue += out.maintenance_overdue
        due_soon += out.maintenance_due_soon
    stats = _stats(db, [m.id for m in machines])
    down = sum(s.downtime_minutes for s in stats.values())
    period = STATS_PERIOD_DAYS * 24 * 60 * max(len(machines), 1)
    lines = db.scalar(
        select(func.count()).select_from(
            scoped(select(ProductionLine.id).where(ProductionLine.is_active.is_(True)), actor, ProductionLine.factory_id, factory_id).subquery()
        )
    ) or 0
    return ResourcesSummary(
        employees_active=active, employees_on_leave=on_leave, employees_by_department=by_dept,
        machines_total=len(machines), machines_by_status=by_status, maintenance_overdue=overdue, maintenance_due_soon=due_soon,
        downtime_hours_30d=round(down / 60, 1), availability_pct_30d=round(100 * (period - down) / period, 1) if machines else 100.0,
        lines_active=lines,
    )
