"""Buyurtma bo'yicha material ehtiyoji (BOM asosida) va buyurtmaga chiqarish."""

import enum

from pydantic import BaseModel, Field

from app.models.product import MaterialType, MaterialUnit


class RequirementStatus(str, enum.Enum):
    NOT_LINKED = "NOT_LINKED"
    SHORTAGE = "SHORTAGE"
    ENOUGH = "ENOUGH"
    ISSUED = "ISSUED"
    OVERUSED = "OVERUSED"


class MaterialRequirement(BaseModel):
    material_id: int | None
    material_code: str | None
    material_name: str
    material_type: MaterialType
    unit: MaterialUnit
    planned: float
    issued: float
    remaining: float
    available: float
    shortage: float
    on_order: float = 0
    variance: float
    variance_pct: float | None
    unit_cost: float | None
    planned_cost: float | None
    issued_cost: float | None
    status: RequirementStatus
    products: list[str]


class OrderMaterials(BaseModel):
    order_id: int
    lines: list[MaterialRequirement]
    products_without_bom: list[str]
    shortage_count: int
    not_linked_count: int
    overused_count: int
    planned_cost: float
    issued_cost: float
    complete: bool


class IssueMode(str, enum.Enum):
    ISSUE = "ISSUE"
    RETURN = "RETURN"


class IssueLine(BaseModel):
    material_id: int
    quantity: float = Field(gt=0, le=10_000_000)
    location_id: int | None = None


class IssueRequest(BaseModel):
    mode: IssueMode = IssueMode.ISSUE
    lines: list[IssueLine] = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=500)
