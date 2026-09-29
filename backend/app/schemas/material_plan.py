"""Buyurtma bo'yicha material ehtiyoji (BOM asosida) va buyurtmaga chiqarish."""

import enum

from pydantic import BaseModel, Field

from app.models.product import MaterialType, MaterialUnit


class RequirementStatus(str, enum.Enum):
    NOT_LINKED = "NOT_LINKED"  # BOM qatori katalogga bog'lanmagan — qoldiq hisoblanmaydi
    SHORTAGE = "SHORTAGE"  # omborda yetishmaydi
    ENOUGH = "ENOUGH"  # omborda yetarli, hali to'liq chiqarilmagan
    ISSUED = "ISSUED"  # rejadagi miqdor to'liq chiqarilgan
    OVERUSED = "OVERUSED"  # rejadan ko'p chiqarilgan (ortiqcha sarf)


class MaterialRequirement(BaseModel):
    material_id: int | None
    material_code: str | None
    material_name: str
    material_type: MaterialType
    unit: MaterialUnit
    planned: float  # BOM × buyurtma miqdori × (1 + isrof %)
    issued: float  # buyurtmaga chiqarilgan (qaytarilgani ayirilgan)
    remaining: float  # yana chiqarilishi kerak
    available: float  # ombordagi joriy qoldiq (barcha joylar)
    shortage: float  # remaining − available (> 0 bo'lsa xarid kerak)
    on_order: float = 0  # yuborilgan xarid buyurtmalarida kelishi kutilayotgan miqdor (barcha buyurtmalar uchun)
    variance: float  # issued − planned (> 0 — ortiqcha sarf)
    variance_pct: float | None
    unit_cost: float | None
    planned_cost: float | None
    issued_cost: float | None
    status: RequirementStatus
    products: list[str]  # qaysi mahsulotlar uchun


class OrderMaterials(BaseModel):
    order_id: int
    lines: list[MaterialRequirement]
    products_without_bom: list[str]
    shortage_count: int
    not_linked_count: int
    overused_count: int
    planned_cost: float
    issued_cost: float
    # Ehtiyoj to'liq hisoblanganmi (BOM yo'q yoki katalogga bog'lanmagan qatorlar bo'lmasa)
    complete: bool


class IssueMode(str, enum.Enum):
    ISSUE = "ISSUE"
    RETURN = "RETURN"


class IssueLine(BaseModel):
    material_id: int
    quantity: float = Field(gt=0, le=10_000_000)
    # Chiqarishda berilmasa — qoldig'i bor joylardan avtomatik (ko'pidan boshlab); qaytarishda majburiy
    location_id: int | None = None


class IssueRequest(BaseModel):
    mode: IssueMode = IssueMode.ISSUE
    lines: list[IssueLine] = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=500)
