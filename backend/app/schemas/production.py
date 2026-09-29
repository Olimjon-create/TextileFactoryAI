from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.production import LogSource, UnitKind, WorkOrderStatus
from app.models.resources import Department, ProductionStage
from app.schemas.common import clean_str


class Ref(BaseModel):
    id: int
    code: str | None = None
    name: str


class WorkOrderCreate(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=1_000_000)
    size: str | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, max_length=30)
    order_item_id: int | None = None
    line_id: int | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    priority: int = Field(default=0, ge=0, le=100)
    overcut_pct: float = Field(default=0, ge=0, le=50)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("size", "color", "notes")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class WorkOrdersFromOrder(BaseModel):
    """Buyurtmaning barcha qatorlari uchun (hali rejalashtirilmagan miqdorga) ish buyurtmalari."""

    line_id: int | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    overcut_pct: float = Field(default=0, ge=0, le=50)


class WorkOrderUpdate(BaseModel):
    quantity: int | None = Field(default=None, ge=1, le=1_000_000)
    line_id: int | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    priority: int | None = Field(default=None, ge=0, le=100)
    overcut_pct: float | None = Field(default=None, ge=0, le=50)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("notes")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class StageProgress(BaseModel):
    stage: ProductionStage
    good: int
    defect: int
    available: int
    remaining: int
    defect_rate: float | None


class WorkOrderOut(BaseModel):
    id: int
    factory_id: int
    number: str
    order_id: int | None
    order_number: str | None
    customer_name: str | None
    product_id: int | None
    product_name: str
    product_code: str
    size: str | None
    color: str | None
    quantity: int
    overcut_pct: float
    status: WorkOrderStatus
    line: Ref | None
    planned_start: date | None
    planned_end: date | None
    priority: int
    notes: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    progress: list[StageProgress]
    current_stage: ProductionStage | None
    finished: int
    percent: float
    is_late: bool


class WorkOrderPage(BaseModel):
    items: list[WorkOrderOut]
    total: int


class LogCreate(BaseModel):
    stage: ProductionStage
    quantity_good: int = Field(default=0, ge=0, le=1_000_000)
    quantity_defect: int = Field(default=0, ge=0, le=1_000_000)
    defect_reason: str | None = Field(default=None, max_length=300)
    fabric_used: float | None = Field(default=None, ge=0, le=10_000_000)
    fabric_waste: float | None = Field(default=None, ge=0, le=10_000_000)
    duration_minutes: int | None = Field(default=None, ge=0, le=24 * 60)
    work_date: date | None = None
    employee_id: int | None = None
    machine_id: int | None = None
    line_id: int | None = None
    shift_id: int | None = None
    unit_code: str | None = Field(default=None, max_length=40)
    source: LogSource = LogSource.MANUAL
    note: str | None = Field(default=None, max_length=500)

    @field_validator("defect_reason", "note", "unit_code")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class LogOut(BaseModel):
    id: int
    work_order_id: int
    work_order_number: str | None = None
    stage: ProductionStage
    work_date: date
    quantity_good: int
    quantity_defect: int
    defect_reason: str | None
    fabric_used: float | None
    fabric_waste: float | None
    duration_minutes: int | None
    employee: Ref | None
    machine: Ref | None
    line: Ref | None
    shift: Ref | None
    unit_code: str | None
    source: LogSource
    note: str | None
    created_by_name: str | None
    created_at: datetime


class UnitCreate(BaseModel):
    kind: UnitKind
    quantity: int = Field(ge=1, le=100_000)
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class UnitOut(BaseModel):
    id: int
    work_order_id: int
    work_order_number: str
    kind: UnitKind
    code: str
    quantity: int
    size: str | None
    color: str | None
    product_name: str
    note: str | None
    created_at: datetime
    stages_done: list[ProductionStage] = []


class FabricUsage(BaseModel):
    planned: float | None
    used: float
    waste: float
    waste_pct: float | None
    per_piece: float | None
    per_piece_planned: float | None


class WorkOrderDetail(WorkOrderOut):
    logs: list[LogOut]
    units: list[UnitOut]
    fabric: FabricUsage


class TraceResult(BaseModel):
    """Kod bo'yicha qidiruv (QR/shtrix-kod skaneri): nima ekanligi va qayerga o'tish kerakligi."""

    kind: str
    code: str
    title: str
    subtitle: str | None = None
    path: str
    work_order: WorkOrderOut | None = None
    unit: UnitOut | None = None
    logs: list[LogOut] = []


class EmployeeKpi(BaseModel):
    employee: Ref
    department: Department
    line: Ref | None
    days_worked: int
    good: int
    defect: int
    defect_rate: float | None
    daily_norm: int | None
    norm_total: int | None
    efficiency_pct: float | None
    minutes: int
    per_hour: float | None


class StageOutput(BaseModel):
    stage: ProductionStage
    good: int
    defect: int
    defect_rate: float | None


class ProductionSummary(BaseModel):
    work_orders_active: int
    work_orders_late: int
    completed_30d: int
    output_today: list[StageOutput]
    output_7d: list[StageOutput]
    fabric_used_30d: float
    fabric_waste_30d: float
    waste_pct_30d: float | None
