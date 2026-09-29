"""Tayyor mahsulot ombori va jo'natmalar."""

import enum
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.logistics import ProductMovementType, ShipmentStatus
from app.models.order import OrderStatus
from app.schemas.common import clean_str
from app.schemas.customer import _phone

MAX_UNITS = 10_000_000


class Ref(BaseModel):
    id: int
    code: str | None = None
    name: str


class LocationQty(BaseModel):
    location: Ref
    quantity: int


class StockRow(BaseModel):
    product: Ref
    size: str | None
    color: str | None
    quantity: int
    locations: list[LocationQty]
    unit_price: float | None
    value: float | None


class StockPage(BaseModel):
    items: list[StockRow]
    total: int


class FgMovementOut(BaseModel):
    id: int
    movement_type: ProductMovementType
    quantity: int
    product: Ref
    size: str | None
    color: str | None
    location: Ref
    work_order_id: int | None
    work_order_number: str | None
    shipment_id: int | None
    shipment_number: str | None
    order_id: int | None
    order_number: str | None
    note: str | None
    created_by_name: str | None
    created_at: datetime


class FgMovementPage(BaseModel):
    items: list[FgMovementOut]
    total: int


class FgMovementInput(str, enum.Enum):
    """Qo'lda kiritiladigan harakatlar (ishlab chiqarish va jo'natma — o'z hujjatlari orqali)."""

    RECEIPT = "RECEIPT"
    RETURN = "RETURN"
    WRITE_OFF = "WRITE_OFF"
    ADJUSTMENT = "ADJUSTMENT"
    TRANSFER = "TRANSFER"


class FgMovementCreate(BaseModel):
    movement_type: FgMovementInput
    product_id: int
    size: str | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, max_length=30)
    location_id: int
    to_location_id: int | None = None
    quantity: int = Field(ge=0, le=MAX_UNITS)
    order_id: int | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("size", "color", "note")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class ProductionReceiptCreate(BaseModel):
    """Qadoqlangan mahsulotni ish buyurtmasidan tayyor mahsulot omboriga qabul qilish."""

    work_order_id: int
    location_id: int
    quantity: int = Field(gt=0, le=MAX_UNITS)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class WorkOrderStock(BaseModel):
    work_order_id: int
    packed: int
    received: int
    remaining: int


class FgSummary(BaseModel):
    skus: int
    units: int
    value: float
    received_30d: int
    shipped_30d: int
    shipments_preparing: int
    shipments_in_transit: int
    shipments_late: int


class _ShipmentFields(BaseModel):
    @field_validator("delivery_address", "carrier", "vehicle_no", "driver_name", "tracking_no", "notes", "received_by", mode="before", check_fields=False)
    @classmethod
    def _strip(cls, v):
        return clean_str(v) if isinstance(v, str) else v

    @field_validator("driver_phone", check_fields=False)
    @classmethod
    def _phone(cls, v):
        return _phone(v)


class ShipmentLineIn(BaseModel):
    order_item_id: int
    quantity: int = Field(gt=0, le=MAX_UNITS)


class ShipmentCreate(_ShipmentFields):
    order_id: int
    items: list[ShipmentLineIn] = Field(min_length=1, max_length=200)
    planned_date: date | None = None
    delivery_address: str | None = Field(default=None, max_length=300)
    carrier: str | None = Field(default=None, max_length=100)
    vehicle_no: str | None = Field(default=None, max_length=30)
    driver_name: str | None = Field(default=None, max_length=100)
    driver_phone: str | None = Field(default=None, max_length=50)
    tracking_no: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=5000)


class ShipmentUpdate(_ShipmentFields):
    """Tayyorlanayotganda hammasi; yo'lga chiqqandan keyin — transport ma'lumotlari va izoh."""

    items: list[ShipmentLineIn] | None = Field(default=None, min_length=1, max_length=200)
    planned_date: date | None = None
    delivery_address: str | None = Field(default=None, max_length=300)
    carrier: str | None = Field(default=None, max_length=100)
    vehicle_no: str | None = Field(default=None, max_length=30)
    driver_name: str | None = Field(default=None, max_length=100)
    driver_phone: str | None = Field(default=None, max_length=50)
    tracking_no: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=5000)


class ShipRequest(BaseModel):
    location_id: int | None = None


class DeliverRequest(_ShipmentFields):
    received_by: str | None = Field(default=None, max_length=100)
    delivered_at: datetime | None = None


class ShipmentLineOut(BaseModel):
    id: int
    order_item_id: int
    product_id: int | None
    product_name: str
    product_code: str
    size: str | None
    color: str | None
    quantity: int
    in_stock: int


class ShipmentOut(BaseModel):
    id: int
    factory_id: int
    number: str
    order_id: int
    order_number: str | None
    customer_name: str
    customer_phone: str
    status: ShipmentStatus
    planned_date: date | None
    delivery_address: str | None
    carrier: str | None
    vehicle_no: str | None
    driver_name: str | None
    driver_phone: str | None
    tracking_no: str | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    received_by: str | None
    notes: str | None
    created_at: datetime
    created_by_name: str | None
    items_count: int
    total_quantity: int
    is_late: bool


class ShipmentPage(BaseModel):
    items: list[ShipmentOut]
    total: int


class ShipmentDetail(ShipmentOut):
    lines: list[ShipmentLineOut]


class OrderShippingLine(BaseModel):
    order_item_id: int
    product_id: int | None
    product_name: str
    product_code: str
    size: str | None
    color: str | None
    ordered: int
    shipped: int
    preparing: int
    remaining: int
    in_stock: int


class OrderShipping(BaseModel):
    order_id: int
    order_status: OrderStatus
    lines: list[OrderShippingLine]
    shipments: list[ShipmentOut]
    fully_shipped: bool
