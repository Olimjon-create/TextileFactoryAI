import re
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.resources import (
    Department,
    EmployeeStatus,
    MachineStatus,
    MachineType,
    MaintenanceKind,
    PayType,
    ProductionStage,
)
from app.schemas.common import clean_str

CODE = re.compile(r"^[A-Z0-9][A-Z0-9._-]{0,29}$")


def _code(v: str) -> str:
    code = v.strip().upper()
    if not CODE.match(code):
        raise ValueError("Kod 1-30 belgi: lotin harflari, raqamlar, '-', '_' yoki '.'")
    return code


class _Clean(BaseModel):
    """Bo'sh satrlarni None ga aylantirish (ixtiyoriy matn maydonlari)."""

    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return clean_str(v) if isinstance(v, str) else v


class Brief(BaseModel):
    id: int
    code: str | None = None
    name: str


class LineCreate(_Clean):
    code: str
    name: str = Field(min_length=2, max_length=100)
    stage: ProductionStage
    capacity_per_shift: int | None = Field(default=None, ge=1, le=1_000_000)
    factory_id: int | None = None

    @field_validator("code")
    @classmethod
    def _c(cls, v: str) -> str:
        return _code(v)


class LineUpdate(_Clean):
    code: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=100)
    stage: ProductionStage | None = None
    capacity_per_shift: int | None = Field(default=None, ge=1, le=1_000_000)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def _c(cls, v: str | None) -> str | None:
        return _code(v) if v is not None else None


class LineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    code: str
    name: str
    stage: ProductionStage
    capacity_per_shift: int | None
    is_active: bool
    employees_count: int = 0
    machines_count: int = 0
    machines_down: int = 0


class ShiftCreate(_Clean):
    name: str = Field(min_length=2, max_length=50)
    start_time: time
    end_time: time
    break_minutes: int = Field(default=0, ge=0, le=600)
    factory_id: int | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.start_time == self.end_time:
            raise ValueError("Boshlanish va tugash vaqti bir xil bo'lmasin")
        return self


class ShiftUpdate(_Clean):
    name: str | None = Field(default=None, min_length=2, max_length=50)
    start_time: time | None = None
    end_time: time | None = None
    break_minutes: int | None = Field(default=None, ge=0, le=600)
    is_active: bool | None = None


class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    name: str
    start_time: time
    end_time: time
    break_minutes: int
    is_active: bool
    work_minutes: int = 0
    is_night: bool = False
    employees_count: int = 0


class EmployeeCreate(_Clean):
    employee_code: str | None = None
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    position: str | None = Field(default=None, max_length=100)
    department: Department
    line_id: int | None = None
    shift_id: int | None = None
    user_id: int | None = None
    hire_date: date | None = None
    pay_type: PayType = PayType.MONTHLY
    pay_rate: float | None = Field(default=None, ge=0, le=10_000_000_000)
    daily_norm: int | None = Field(default=None, ge=1, le=1_000_000)
    status: EmployeeStatus = EmployeeStatus.ACTIVE
    notes: str | None = Field(default=None, max_length=500)
    factory_id: int | None = None

    @field_validator("employee_code")
    @classmethod
    def _c(cls, v: str | None) -> str | None:
        return _code(v) if v else None


class EmployeeUpdate(_Clean):
    employee_code: str | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    position: str | None = Field(default=None, max_length=100)
    department: Department | None = None
    line_id: int | None = None
    shift_id: int | None = None
    user_id: int | None = None
    hire_date: date | None = None
    pay_type: PayType | None = None
    pay_rate: float | None = Field(default=None, ge=0, le=10_000_000_000)
    daily_norm: int | None = Field(default=None, ge=1, le=1_000_000)
    status: EmployeeStatus | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("employee_code")
    @classmethod
    def _c(cls, v: str | None) -> str | None:
        return _code(v) if v else None


class EmployeeOut(BaseModel):
    id: int
    factory_id: int
    employee_code: str
    full_name: str
    phone: str | None
    position: str | None
    department: Department
    line: Brief | None
    shift: Brief | None
    user_id: int | None
    user_email: str | None
    hire_date: date | None
    pay_type: PayType
    pay_rate: float | None
    daily_norm: int | None
    status: EmployeeStatus
    notes: str | None
    created_at: datetime


class EmployeePage(BaseModel):
    items: list[EmployeeOut]
    total: int


class MachineCreate(_Clean):
    code: str
    name: str = Field(min_length=2, max_length=150)
    machine_type: MachineType
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    serial_number: str | None = Field(default=None, max_length=100)
    line_id: int | None = None
    status: MachineStatus = MachineStatus.IDLE
    purchase_date: date | None = None
    maintenance_interval_days: int | None = Field(default=None, ge=1, le=3650)
    last_maintenance_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)
    factory_id: int | None = None

    @field_validator("code")
    @classmethod
    def _c(cls, v: str) -> str:
        return _code(v)


class MachineUpdate(_Clean):
    """Holat bu yerda o'zgarmaydi — faqat /status orqali (tarix yozilishi uchun)."""

    code: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=150)
    machine_type: MachineType | None = None
    brand: str | None = Field(default=None, max_length=100)
    model: str | None = Field(default=None, max_length=100)
    serial_number: str | None = Field(default=None, max_length=100)
    line_id: int | None = None
    purchase_date: date | None = None
    maintenance_interval_days: int | None = Field(default=None, ge=1, le=3650)
    last_maintenance_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def _c(cls, v: str | None) -> str | None:
        return _code(v) if v is not None else None


class MachineStatusChange(_Clean):
    status: MachineStatus
    reason: str | None = Field(default=None, max_length=300)


class MaintenanceCreate(_Clean):
    kind: MaintenanceKind
    description: str = Field(min_length=3, max_length=5000)
    performed_at: datetime | None = None
    parts_used: str | None = Field(default=None, max_length=500)
    duration_minutes: int | None = Field(default=None, ge=0, le=100_000)
    cost: float | None = Field(default=None, ge=0, le=10_000_000_000)
    technician_id: int | None = None
    technician_name: str | None = Field(default=None, max_length=200)
    set_status: MachineStatus | None = None


class MachineOut(BaseModel):
    id: int
    factory_id: int
    code: str
    name: str
    machine_type: MachineType
    brand: str | None
    model: str | None
    serial_number: str | None
    line: Brief | None
    status: MachineStatus
    status_since: datetime
    purchase_date: date | None
    maintenance_interval_days: int | None
    last_maintenance_date: date | None
    next_maintenance_date: date | None
    maintenance_overdue: bool
    maintenance_due_soon: bool
    notes: str | None
    is_active: bool
    created_at: datetime


class MachinePage(BaseModel):
    items: list[MachineOut]
    total: int


class StatusPeriod(BaseModel):
    id: int
    status: MachineStatus
    started_at: datetime
    ended_at: datetime | None
    duration_minutes: int
    reason: str | None
    created_by_name: str | None


class MaintenanceOut(BaseModel):
    id: int
    kind: MaintenanceKind
    performed_at: datetime
    description: str
    parts_used: str | None
    duration_minutes: int | None
    cost: float | None
    technician: Brief | None
    technician_name: str | None
    created_at: datetime


class MachineStats(BaseModel):
    period_days: int
    downtime_minutes: int
    broken_minutes: int
    maintenance_minutes: int
    working_minutes: int
    availability_pct: float
    breakdowns: int
    repair_cost: float


class MachineDetail(MachineOut):
    stats: MachineStats
    history: list[StatusPeriod]
    maintenance: list[MaintenanceOut]


class ResourcesSummary(BaseModel):
    employees_active: int
    employees_on_leave: int
    employees_by_department: dict[str, int]
    machines_total: int
    machines_by_status: dict[str, int]
    maintenance_overdue: int
    maintenance_due_soon: int
    downtime_hours_30d: float
    availability_pct_30d: float
    lines_active: int
