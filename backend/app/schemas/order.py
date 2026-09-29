from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.order import OrderSource, OrderStatus, PaymentStatus
from app.schemas.common import clean_str
from app.schemas.factory import FactoryBrief


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int | None
    product_name: str
    product_code: str
    size: str | None = None
    color: str | None = None
    unit_price: float
    quantity: int
    line_total: float


class CustomerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    customer_code: str


class OrderListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    order_number: str | None
    factory_id: int
    factory: FactoryBrief | None = None
    customer_id: int | None
    customer_name: str
    customer_phone: str
    status: OrderStatus
    payment_status: PaymentStatus
    total_amount: float
    currency: str
    items_count: int = 0
    total_quantity: int = 0
    source: OrderSource
    due_date: date | None
    is_overdue: bool = False
    created_at: datetime
    paid_at: datetime | None


class OrderOut(OrderListItem):
    customer: CustomerBrief | None = None
    delivery_address: str | None
    comment: str | None
    payment_provider: str
    payment_reference: str | None
    card_last4: str | None
    items: list[OrderItemOut]
    updated_at: datetime


class OrderPage(BaseModel):
    items: list[OrderListItem]
    total: int


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


MAX_LINE_QTY = 1_000_000


class ManualOrderLine(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=MAX_LINE_QTY)
    size: str | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, max_length=30)
    unit_price: float | None = Field(default=None, ge=0, le=100_000_000_000)

    @field_validator("size", "color")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class ManualOrderCreate(BaseModel):
    customer_id: int
    items: list[ManualOrderLine] = Field(min_length=1, max_length=200)
    due_date: date | None = None
    delivery_address: str | None = Field(default=None, max_length=300)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("delivery_address", "comment")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class OrderUpdate(BaseModel):
    due_date: date | None = None
    delivery_address: str | None = Field(default=None, max_length=300)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("delivery_address", "comment")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class OrderSummary(BaseModel):
    new_count: int
    by_status: dict[str, int]
