import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.product import MaterialType, MaterialUnit, ProductionUnit, ProductStatus
from app.schemas.common import media_url
from app.schemas.factory import FactoryBrief

MAX_PRICE = 100_000_000_000  # 100 mlrd so'm

CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._-]{1,49}$")
MAX_VARIANTS = 50
MAX_VARIANT_LENGTH = 30


def _normalize_code(value: str) -> str:
    code = value.strip().upper()
    if not CODE_PATTERN.match(code):
        raise ValueError(
            "Kod 2-50 belgidan iborat bo'lsin: lotin harflari, raqamlar, '-', '_' yoki '.'"
        )
    return code


def _normalize_variants(values: list[str]) -> list[str]:
    """O'lcham/rang ro'yxati: bo'sh joylarni olib tashlash va takrorlarni yo'qotish."""
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        value = raw.strip()
        if not value:
            continue
        if len(value) > MAX_VARIANT_LENGTH:
            raise ValueError(f"Qiymat {MAX_VARIANT_LENGTH} belgidan oshmasin: {value}")
        key = value.lower()
        if key not in seen:
            seen.add(key)
            result.append(value)
    if len(result) > MAX_VARIANTS:
        raise ValueError(f"Ko'pi bilan {MAX_VARIANTS} ta qiymat kiritish mumkin")
    return result


def _strip_optional(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


# ---------- BOM ----------


class BOMItemBase(BaseModel):
    # Ombor katalogidagi material (ixtiyoriy). Berilsa nom/tur/birlik katalogdan olinadi
    material_id: int | None = None
    material_type: MaterialType
    material_name: str = Field(min_length=2, max_length=200)
    quantity: float = Field(gt=0, le=1_000_000, description="Mahsulotning 1 birligi uchun sarf")
    unit: MaterialUnit
    waste_percent: float = Field(default=0, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("material_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        return v.strip()

    @field_validator("notes")
    @classmethod
    def _strip_notes(cls, v: str | None) -> str | None:
        return _strip_optional(v)

    @field_validator("quantity", "waste_percent")
    @classmethod
    def _round(cls, v: float) -> float:
        return round(v, 4)


class BOMItemCreate(BOMItemBase):
    pass


class BOMItemUpdate(BaseModel):
    material_id: int | None = None
    material_type: MaterialType | None = None
    material_name: str | None = Field(default=None, min_length=2, max_length=200)
    quantity: float | None = Field(default=None, gt=0, le=1_000_000)
    unit: MaterialUnit | None = None
    waste_percent: float | None = Field(default=None, ge=0, le=100)
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("material_name")
    @classmethod
    def _strip_name(cls, v: str | None) -> str | None:
        return v.strip() if v else v

    @field_validator("notes")
    @classmethod
    def _strip_notes(cls, v: str | None) -> str | None:
        return _strip_optional(v)


class BOMItemOut(BOMItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    material_code: str | None = None
    created_at: datetime


# ---------- Product ----------


class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    code: str = Field(min_length=2, max_length=50)
    category: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    sizes: list[str] = Field(default_factory=list)
    colors: list[str] = Field(default_factory=list)
    unit: ProductionUnit = ProductionUnit.PIECE
    status: ProductStatus = ProductStatus.DRAFT
    price: float | None = Field(default=None, ge=0, le=MAX_PRICE)
    image_url: str | None = Field(default=None, max_length=500)
    model_image_url: str | None = Field(default=None, max_length=500)

    @field_validator("image_url", "model_image_url")
    @classmethod
    def _image(cls, v: str | None) -> str | None:
        return media_url(v)

    @field_validator("price")
    @classmethod
    def _price(cls, v: float | None) -> float | None:
        return round(v, 2) if v is not None else v

    @field_validator("name", "category")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        return _normalize_code(v)

    @field_validator("sizes", "colors")
    @classmethod
    def _variants(cls, v: list[str]) -> list[str]:
        return _normalize_variants(v)

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return _strip_optional(v)


class ProductCreate(ProductBase):
    # Faqat SUPER_ADMIN uchun majburiy; boshqalarda o'z fabrikasi olinadi
    factory_id: int | None = None
    bom_items: list[BOMItemCreate] = Field(default_factory=list, max_length=200)


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    code: str | None = Field(default=None, min_length=2, max_length=50)
    category: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=2000)
    sizes: list[str] | None = None
    colors: list[str] | None = None
    unit: ProductionUnit | None = None
    status: ProductStatus | None = None
    price: float | None = Field(default=None, ge=0, le=MAX_PRICE)
    image_url: str | None = Field(default=None, max_length=500)
    model_image_url: str | None = Field(default=None, max_length=500)

    @field_validator("image_url", "model_image_url")
    @classmethod
    def _image(cls, v: str | None) -> str | None:
        return media_url(v)

    @field_validator("price")
    @classmethod
    def _price(cls, v: float | None) -> float | None:
        return round(v, 2) if v is not None else v

    @field_validator("name", "category")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() if v else v

    @field_validator("code")
    @classmethod
    def _code(cls, v: str | None) -> str | None:
        return _normalize_code(v) if v is not None else v

    @field_validator("sizes", "colors")
    @classmethod
    def _variants(cls, v: list[str] | None) -> list[str] | None:
        return _normalize_variants(v) if v is not None else v

    @field_validator("description")
    @classmethod
    def _description(cls, v: str | None) -> str | None:
        return _strip_optional(v)


class ProductListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    factory: FactoryBrief | None = None
    name: str
    code: str
    category: str
    description: str | None
    sizes: list[str]
    colors: list[str]
    unit: ProductionUnit
    status: ProductStatus
    price: float | None = None
    image_url: str | None = None
    model_image_url: str | None = None
    bom_items_count: int = 0
    created_at: datetime
    updated_at: datetime


class ProductOut(ProductListItem):
    bom_items: list[BOMItemOut] = []
