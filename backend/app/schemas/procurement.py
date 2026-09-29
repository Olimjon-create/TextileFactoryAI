"""Ta'minot: yetkazib beruvchilar va xarid buyurtmalari."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.procurement import PurchaseStatus
from app.models.product import MaterialType, MaterialUnit
from app.schemas.common import clean_str
from app.schemas.customer import _code, _country, _phone
from app.schemas.inventory import MAX_COST, MAX_QTY, MovementOut


class Ref(BaseModel):
    id: int
    code: str | None = None
    name: str


# ---------- yetkazib beruvchilar ----------


class _SupplierFields(BaseModel):
    @field_validator("name", "contact_person", "address", "notes", "tax_id", mode="before", check_fields=False)
    @classmethod
    def _strip(cls, v):
        return clean_str(v) if isinstance(v, str) else v

    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _email(cls, v):
        return clean_str(v) if isinstance(v, str) else v

    @field_validator("code", check_fields=False)
    @classmethod
    def _code(cls, v):
        return _code(v)

    @field_validator("phone", check_fields=False)
    @classmethod
    def _phone(cls, v):
        return _phone(v)

    @field_validator("country", check_fields=False)
    @classmethod
    def _country(cls, v):
        return _country(v)


class SupplierCreate(_SupplierFields):
    name: str = Field(min_length=2, max_length=200)
    code: str | None = Field(default=None, max_length=30)  # bo'sh bo'lsa SUP-00001 ...
    contact_person: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    country: str | None = Field(default=None, max_length=2)
    address: str | None = Field(default=None, max_length=300)
    tax_id: str | None = Field(default=None, max_length=30)
    payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    lead_time_days: int | None = Field(default=None, ge=0, le=365)
    notes: str | None = Field(default=None, max_length=5000)
    factory_id: int | None = None


class SupplierUpdate(_SupplierFields):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    code: str | None = Field(default=None, max_length=30)
    contact_person: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    country: str | None = Field(default=None, max_length=2)
    address: str | None = Field(default=None, max_length=300)
    tax_id: str | None = Field(default=None, max_length=30)
    payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    lead_time_days: int | None = Field(default=None, ge=0, le=365)
    notes: str | None = Field(default=None, max_length=5000)
    is_active: bool | None = None


class SupplierOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    code: str
    name: str
    contact_person: str | None
    phone: str | None
    email: str | None
    country: str | None
    address: str | None
    tax_id: str | None
    payment_terms_days: int | None
    lead_time_days: int | None
    notes: str | None
    is_active: bool
    created_at: datetime
    # Hisoblanadi (xarid buyurtmalari va kirimlardan)
    open_orders: int = 0
    received_value: float = 0


class SupplierPage(BaseModel):
    items: list[SupplierOut]
    total: int


class SupplierStats(BaseModel):
    orders_total: int
    open_orders: int
    overdue_orders: int
    received_value: float  # qabul qilingan tovar qiymati
    open_value: float  # hali kelmagan qism qiymati
    # Muddatida yetkazish: to'liq qabul qilingan va kutilgan sanasi bor buyurtmalar orasida
    on_time_pct: float | None
    avg_lead_days: float | None  # yuborilgandan oxirgi kirimgacha, kun


class SupplierDetail(SupplierOut):
    stats: SupplierStats


# ---------- xarid buyurtmalari ----------


class PurchaseLineIn(BaseModel):
    material_id: int
    quantity: float = Field(gt=0, le=MAX_QTY)
    unit_price: float = Field(ge=0, le=MAX_COST)
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class PurchaseOrderCreate(BaseModel):
    supplier_id: int
    order_date: date | None = None  # bo'sh — bugun
    expected_date: date | None = None
    order_id: int | None = None
    currency: str = Field(default="UZS", pattern=r"^[A-Z]{3}$")
    notes: str | None = Field(default=None, max_length=5000)
    items: list[PurchaseLineIn] = Field(min_length=1, max_length=200)

    @field_validator("notes")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class PurchaseOrderUpdate(BaseModel):
    """Qoralamada hammasi o'zgaradi; yuborilgandan keyin — faqat kutilgan sana va izoh."""

    supplier_id: int | None = None
    order_date: date | None = None
    expected_date: date | None = None
    order_id: int | None = None
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    notes: str | None = Field(default=None, max_length=5000)
    items: list[PurchaseLineIn] | None = Field(default=None, min_length=1, max_length=200)

    @field_validator("notes")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class PurchaseLineOut(BaseModel):
    id: int
    material: Ref
    material_type: MaterialType
    unit: MaterialUnit
    quantity: float
    unit_price: float
    amount: float
    received: float
    remaining: float
    note: str | None


class PurchaseOrderOut(BaseModel):
    id: int
    factory_id: int
    number: str
    supplier: Ref
    status: PurchaseStatus
    order_date: date
    expected_date: date | None
    order_id: int | None
    order_number: str | None
    currency: str
    notes: str | None
    ordered_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    created_by_name: str | None
    items_count: int
    total_amount: float
    received_amount: float
    received_pct: float
    is_overdue: bool


class PurchaseOrderPage(BaseModel):
    items: list[PurchaseOrderOut]
    total: int


class PurchaseOrderDetail(PurchaseOrderOut):
    lines: list[PurchaseLineOut]
    receipts: list[MovementOut]


class ReceiveLine(BaseModel):
    item_id: int
    quantity: float = Field(gt=0, le=MAX_QTY)


class ReceiveRequest(BaseModel):
    location_id: int
    lines: list[ReceiveLine] = Field(min_length=1, max_length=200)
    document_no: str | None = Field(default=None, max_length=50)  # yetkazib beruvchi yuk xati / faktura raqami
    note: str | None = Field(default=None, max_length=500)

    @field_validator("document_no", "note")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class ProcurementSummary(BaseModel):
    suppliers_count: int
    open_orders: int
    overdue_orders: int
    drafts: int
    open_value: float  # hali qabul qilinmagan tovar qiymati
    expected_7d: int  # 7 kun ichida kutilayotgan buyurtmalar
