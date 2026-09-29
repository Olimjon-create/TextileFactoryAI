from datetime import date, datetime

from pydantic import BaseModel

from app.models.product import MaterialType, MaterialUnit


class TurnoverRow(BaseModel):
    material_id: int
    code: str
    name: str
    material_type: MaterialType
    unit: MaterialUnit
    factory_id: int
    unit_cost: float | None
    opening: float
    receipts: float
    issues: float
    write_offs: float
    adjustments: float
    closing: float
    receipts_value: float
    issues_value: float
    closing_value: float | None
    last_movement_at: datetime | None


class TypeValue(BaseModel):
    material_type: MaterialType
    materials: int
    value: float


class TurnoverTotals(BaseModel):
    opening_value: float
    receipts_value: float
    issues_value: float
    write_offs_value: float
    closing_value: float
    without_cost: int


class TurnoverReport(BaseModel):
    date_from: date
    date_to: date
    rows: list[TurnoverRow]
    totals: TurnoverTotals
    by_type: list[TypeValue]
