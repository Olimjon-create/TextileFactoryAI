"""Resurslar: ishlab chiqarish liniyalari, smenalar, xodimlar, mashinalar (holat, texnik xizmat, ta'mir)."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.models.resources import Department, EmployeeStatus, MachineStatus, MachineType
from app.schemas.resources import (
    EmployeeCreate,
    EmployeeOut,
    EmployeePage,
    EmployeeUpdate,
    LineCreate,
    LineOut,
    LineUpdate,
    MachineCreate,
    MachineDetail,
    MachinePage,
    MachineStatusChange,
    MachineUpdate,
    MaintenanceCreate,
    ResourcesSummary,
    ShiftCreate,
    ShiftOut,
    ShiftUpdate,
)
from app.services import machine_service as machines
from app.services import workforce_service as workforce

router = APIRouter(tags=["Resources: workforce & machines"])
wf_view = require_roles(*workforce.WORKFORCE_VIEW_ROLES)
wf_edit = require_roles(*workforce.WORKFORCE_EDITOR_ROLES)
m_view = require_roles(*machines.MACHINE_VIEW_ROLES)
m_edit = require_roles(*machines.MACHINE_EDITOR_ROLES)


@router.get("/resources/summary", response_model=ResourcesSummary)
def resources_summary(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(m_view)):
    return machines.summary(db, actor, factory_id)


@router.get("/production-lines", response_model=list[LineOut])
def list_lines(include_inactive: bool = False, factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(wf_view)):
    return workforce.list_lines(db, actor, include_inactive=include_inactive, factory_id=factory_id)


@router.post("/production-lines", response_model=LineOut, status_code=status.HTTP_201_CREATED)
def create_line(data: LineCreate, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    return workforce.create_line(db, actor, data)


@router.patch("/production-lines/{line_id}", response_model=LineOut)
def update_line(line_id: int, data: LineUpdate, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    return workforce.update_line(db, actor, line_id, data)


@router.delete("/production-lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_line(line_id: int, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    workforce.delete_line(db, actor, line_id)


@router.get("/shifts", response_model=list[ShiftOut])
def list_shifts(include_inactive: bool = False, factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(wf_view)):
    return workforce.list_shifts(db, actor, include_inactive=include_inactive, factory_id=factory_id)


@router.post("/shifts", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(data: ShiftCreate, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    return workforce.create_shift(db, actor, data)


@router.patch("/shifts/{shift_id}", response_model=ShiftOut)
def update_shift(shift_id: int, data: ShiftUpdate, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    return workforce.update_shift(db, actor, shift_id, data)


@router.delete("/shifts/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift(shift_id: int, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    workforce.delete_shift(db, actor, shift_id)


@router.get("/employees", response_model=EmployeePage)
def list_employees(
    search: str | None = Query(default=None, max_length=100),
    department: Department | None = None,
    line_id: int | None = None,
    shift_id: int | None = None,
    status_: EmployeeStatus | None = Query(default=None, alias="status"),
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(wf_view),
):
    return workforce.list_employees(
        db, actor, search=search, department=department, line_id=line_id, shift_id=shift_id, status_=status_,
        factory_id=factory_id, offset=offset, limit=limit,
    )


@router.post("/employees", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(data: EmployeeCreate, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    return workforce.create_employee(db, actor, data)


@router.get("/employees/{employee_id}", response_model=EmployeeOut)
def get_employee(employee_id: int, db: Session = Depends(get_db), actor: User = Depends(wf_view)):
    return workforce.get_employee(db, actor, employee_id)


@router.patch("/employees/{employee_id}", response_model=EmployeeOut)
def update_employee(employee_id: int, data: EmployeeUpdate, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    return workforce.update_employee(db, actor, employee_id, data)


@router.delete("/employees/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: int, db: Session = Depends(get_db), actor: User = Depends(wf_edit)):
    workforce.delete_employee(db, actor, employee_id)


@router.get("/machines", response_model=MachinePage)
def list_machines(
    search: str | None = Query(default=None, max_length=100),
    status_: MachineStatus | None = Query(default=None, alias="status"),
    machine_type: MachineType | None = None,
    line_id: int | None = None,
    maintenance: Literal["overdue", "due_soon"] | None = None,
    is_active: bool | None = True,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(m_view),
):
    return machines.list_machines(
        db, actor, search=search, status_=status_, machine_type=machine_type, line_id=line_id, maintenance=maintenance,
        is_active=is_active, factory_id=factory_id, offset=offset, limit=limit,
    )


@router.post("/machines", response_model=MachineDetail, status_code=status.HTTP_201_CREATED)
def create_machine(data: MachineCreate, db: Session = Depends(get_db), actor: User = Depends(m_edit)):
    return machines.create_machine(db, actor, data)


@router.get("/machines/{machine_id}", response_model=MachineDetail)
def get_machine(machine_id: int, db: Session = Depends(get_db), actor: User = Depends(m_view)):
    return machines.get_machine(db, actor, machine_id)


@router.patch("/machines/{machine_id}", response_model=MachineDetail)
def update_machine(machine_id: int, data: MachineUpdate, db: Session = Depends(get_db), actor: User = Depends(m_edit)):
    return machines.update_machine(db, actor, machine_id, data)


@router.delete("/machines/{machine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_machine(machine_id: int, db: Session = Depends(get_db), actor: User = Depends(m_edit)):
    machines.delete_machine(db, actor, machine_id)


@router.post("/machines/{machine_id}/status", response_model=MachineDetail)
def change_machine_status(machine_id: int, data: MachineStatusChange, db: Session = Depends(get_db), actor: User = Depends(m_edit)):
    """Holatni o'zgartirish: oldingi davr yopiladi, yangisi ochiladi (downtime shundan hisoblanadi)."""
    return machines.change_status(db, actor, machine_id, data)


@router.post("/machines/{machine_id}/maintenance", response_model=MachineDetail, status_code=status.HTTP_201_CREATED)
def add_maintenance(machine_id: int, data: MaintenanceCreate, db: Session = Depends(get_db), actor: User = Depends(m_edit)):
    """Texnik xizmat yoki ta'mirlashni qayd etish (ixtiyoriy: yakunida holatni o'zgartirish)."""
    return machines.add_maintenance(db, actor, machine_id, data)
