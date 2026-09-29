import enum
import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.inventory import MovementType
from app.models.product import MaterialType, MaterialUnit
from app.schemas.common import clean_str

CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._-]{0,49}$")
MAX_QTY = 10_000_000
MAX_COST = 1_000_000_000


def _code(value: str, max_len: int = 50) -> str:
    code = value.strip().upper()
    if len(code) > max_len or not CODE_PATTERN.match(code):
        raise ValueError(f"Kod 1-{max_len} belgi: lotin harflari, raqamlar, '-', '_' yoki '.'")
    return code


# ---------- Materiallar ----------


class MaterialCreate(BaseModel):
    code: str
    name: str = Field(min_length=2, max_length=200)
    material_type: MaterialType
    unit: MaterialUnit
    color: str | None = Field(default=None, max_length=50)
    min_stock: float = Field(default=0, ge=0, le=MAX_QTY)
    unit_cost: float | None = Field(default=None, ge=0, le=MAX_COST)
    notes: str | None = Field(default=None, max_length=500)
    factory_id: int | None = None  # faqat SUPER_ADMIN uchun majburiy

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        return _code(v)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return v.strip()

    @field_validator("color", "notes")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class MaterialUpdate(BaseModel):
    code: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=200)
    material_type: MaterialType | None = None
    unit: MaterialUnit | None = None
    color: str | None = Field(default=None, max_length=50)
    min_stock: float | None = Field(default=None, ge=0, le=MAX_QTY)
    unit_cost: float | None = Field(default=None, ge=0, le=MAX_COST)
    notes: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def _code(cls, v: str | None) -> str | None:
        return _code(v) if v is not None else None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return v.strip() if v else v

    @field_validator("color", "notes")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class MaterialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    factory_name: str | None = None
    code: str
    name: str
    material_type: MaterialType
    unit: MaterialUnit
    color: str | None
    min_stock: float
    unit_cost: float | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    # Hisoblangan qiymatlar (harakatlar jurnalidan)
    stock: float = 0
    stock_value: float | None = None
    is_low: bool = False


class MaterialPage(BaseModel):
    items: list[MaterialOut]
    total: int


class LocationStock(BaseModel):
    location_id: int
    location_code: str
    location_name: str
    quantity: float


class MaterialDetail(MaterialOut):
    locations: list[LocationStock] = []
    bom_usage_count: int = 0  # nechta mahsulot BOM'ida ishlatilgan


# ---------- Joylashuvlar ----------


class LocationCreate(BaseModel):
    code: str
    name: str = Field(min_length=2, max_length=100)
    factory_id: int | None = None

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        return _code(v, 30)

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        return v.strip()


class LocationUpdate(BaseModel):
    code: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=100)
    is_active: bool | None = None

    @field_validator("code")
    @classmethod
    def _code(cls, v: str | None) -> str | None:
        return _code(v, 30) if v is not None else None

    @field_validator("name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        return v.strip() if v else v


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    code: str
    name: str
    is_active: bool
    created_at: datetime
    materials_count: int = 0  # shu joyda qoldig'i bor materiallar soni


# ---------- Harakatlar ----------


class MovementInput(str, enum.Enum):
    """Foydalanuvchi kiritadigan harakat turlari (TRANSFER — ikki yozuvga aylanadi)."""

    RECEIPT = "RECEIPT"
    ISSUE = "ISSUE"
    RETURN = "RETURN"
    WRITE_OFF = "WRITE_OFF"
    ADJUSTMENT = "ADJUSTMENT"
    TRANSFER = "TRANSFER"


class MovementCreate(BaseModel):
    movement_type: MovementInput
    material_id: int
    location_id: int
    to_location_id: int | None = None  # faqat TRANSFER uchun
    # ADJUSTMENT uchun — sanoq natijasi (joydagi haqiqiy qoldiq); boshqalar uchun — miqdor (> 0)
    quantity: float = Field(ge=0, le=MAX_QTY)
    unit_cost: float | None = Field(default=None, ge=0, le=MAX_COST)
    order_id: int | None = None
    document_no: str | None = Field(default=None, max_length=50)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("quantity")
    @classmethod
    def _round(cls, v: float) -> float:
        return round(v, 3)

    @field_validator("document_no", "note")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class Ref(BaseModel):
    id: int
    code: str
    name: str


class MovementOut(BaseModel):
    id: int
    factory_id: int
    movement_type: MovementType
    quantity: float
    unit_cost: float | None
    material: Ref
    material_unit: MaterialUnit
    location: Ref
    order_id: int | None
    order_number: str | None = None
    document_no: str | None
    note: str | None
    transfer_group: str | None
    purchase_item_id: int | None = None
    created_by_name: str | None
    created_at: datetime


class MovementPage(BaseModel):
    items: list[MovementOut]
    total: int


class InventorySummary(BaseModel):
    materials_count: int
    low_stock_count: int
    out_of_stock_count: int
    stock_value: float
    locations_count: int
    movements_today: int
    receipts_30d: int
    issues_30d: int
