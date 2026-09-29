"""Tahlil: sozlamalar, tannarx, rahbar dashboardi, hisobotlar, bildirishnomalar."""

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.inventory import InventorySummary
from app.schemas.logistics import FgSummary
from app.schemas.procurement import ProcurementSummary
from app.schemas.production import ProductionSummary
from app.schemas.resources import ResourcesSummary

# ---------- sozlamalar ----------


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    factory_id: int
    overhead_percent: float
    monthly_work_hours: float
    defect_alert_percent: float
    low_margin_percent: float


class SettingsUpdate(BaseModel):
    overhead_percent: float | None = Field(default=None, ge=0, le=500)
    monthly_work_hours: float | None = Field(default=None, gt=0, le=744)
    defect_alert_percent: float | None = Field(default=None, ge=0, le=100)
    low_margin_percent: float | None = Field(default=None, ge=-100, le=100)


# ---------- tannarx ----------


class CostLine(BaseModel):
    material_id: int
    code: str
    name: str
    unit: str
    quantity: float  # buyurtmaga chiqarilgan (qaytarilgani ayirilgan)
    cost: float
    unpriced: bool  # narxi noma'lum — tannarxga kirmagan


class LaborLine(BaseModel):
    employee_id: int | None
    name: str
    pay_type: str | None
    good: int
    minutes: int
    cost: float
    unpriced_logs: int  # stavka yoki ish vaqti kiritilmagan yozuvlar


class OrderCosting(BaseModel):
    order_id: int
    order_number: str | None
    currency: str
    revenue: float
    ordered_qty: int
    produced_qty: int  # qadoqlangan
    material_planned: float  # BOM × miqdor × joriy narx
    material_actual: float
    labor: float
    overhead_percent: float
    overhead: float
    total_cost: float
    cost_per_unit: float | None
    margin: float
    margin_pct: float | None
    low_margin: bool
    materials: list[CostLine]
    labor_lines: list[LaborLine]
    warnings: list[str]  # hisob to'liq emasligi sabablari


# ---------- dashboard ----------


class DayPoint(BaseModel):
    day: date
    value: float
    extra: float = 0


class SalesSection(BaseModel):
    by_status: dict[str, int]
    open_orders: int
    overdue: int
    due_7d: int
    revenue_30d: float  # to'langan buyurtmalar
    orders_30d: int
    revenue_by_day: list[DayPoint]


class ProductionSection(BaseModel):
    summary: ProductionSummary
    packed_by_day: list[DayPoint]  # value — qadoqlangan, extra — brak (barcha bosqichlar)
    top_defects: list[dict[str, Any]]


class OverviewOut(BaseModel):
    sales: SalesSection | None = None
    production: ProductionSection | None = None
    inventory: InventorySummary | None = None
    finished_goods: FgSummary | None = None
    procurement: ProcurementSummary | None = None
    resources: ResourcesSummary | None = None
    material_issued_30d: float | None = None  # moliya: buyurtmalarga chiqarilgan material qiymati


# ---------- hisobotlar ----------

ReportKind = Literal["production", "defects", "employees", "sales", "costing", "inventory", "suppliers"]


class ReportColumn(BaseModel):
    key: str
    label: str
    type: Literal["text", "number", "money", "percent", "date"] = "text"


class ReportTable(BaseModel):
    kind: ReportKind
    title: str
    date_from: date | None
    date_to: date | None
    columns: list[ReportColumn]
    rows: list[dict[str, Any]]
    totals: dict[str, Any] | None = None


class ReportInfo(BaseModel):
    kind: ReportKind
    title: str
    description: str
    uses_dates: bool


# ---------- bildirishnomalar ----------


class Notification(BaseModel):
    key: str
    type: str
    severity: Literal["error", "warning", "info"]
    title: str
    message: str
    path: str
    at: datetime | date | None = None
    read: bool = False


class NotificationList(BaseModel):
    items: list[Notification]
    unread: int


class MarkRead(BaseModel):
    keys: list[str] = Field(min_length=1, max_length=500)
