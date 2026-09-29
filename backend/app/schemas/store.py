"""Ochiq katalog (mijozlar uchun, login talab qilinmaydi) sxemalari.

Bu yerda faqat ommaga ko'rsatish mumkin bo'lgan maydonlar bor — ichki ma'lumotlar
(BOM, xodimlar, CRM) hech qachon qaytarilmaydi.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.order import OrderStatus, PaymentStatus
from app.models.product import ProductionUnit
from app.schemas.common import clean_str
from app.schemas.customer import PHONE_PATTERN

MAX_ITEM_QUANTITY = 100_000
MAX_ORDER_LINES = 50


class StoreFactoryCard(BaseModel):
    id: int
    name: str
    city: str | None
    short_description: str | None
    logo_url: str | None
    cover_url: str | None
    product_count: int
    categories: list[str]
    min_price: float | None


class StoreProduct(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str
    category: str
    description: str | None
    sizes: list[str]
    colors: list[str]
    unit: ProductionUnit
    price: float
    image_url: str | None
    model_image_url: str | None = None


class StoreFeaturedProduct(BaseModel):
    """Bosh sahifa kollaji uchun: surat bosilganda shu zavod va mahsulotga o'tiladi."""

    product_id: int
    product_name: str
    factory_id: int
    factory_name: str
    image_url: str
    price: float


class StoreFactoryDetail(BaseModel):
    id: int
    name: str
    city: str | None
    address: str | None
    phone: str | None
    short_description: str | None
    description: str | None
    logo_url: str | None
    cover_url: str | None
    products: list[StoreProduct]


class CartLine(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=MAX_ITEM_QUANTITY)
    # Mahsulotda o'lcham/rang bo'lsa — ulardan biri majburiy (serverda tekshiriladi)
    size: str | None = Field(default=None, max_length=30)
    color: str | None = Field(default=None, max_length=30)

    @field_validator("size", "color")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)


class CheckoutRequest(BaseModel):
    factory_id: int
    items: list[CartLine] = Field(min_length=1, max_length=MAX_ORDER_LINES)
    customer_name: str = Field(min_length=2, max_length=200)
    customer_phone: str = Field(max_length=50)
    delivery_address: str | None = Field(default=None, max_length=300)
    comment: str | None = Field(default=None, max_length=2000)
    # Telegram Mini App ichida ochilgan bo'lsa — Telegram.WebApp.initData (serverda imzosi tekshiriladi)
    telegram_init_data: str | None = Field(default=None, max_length=4096)

    @field_validator("customer_name", mode="before")
    @classmethod
    def _name(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("delivery_address", "comment")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)

    @field_validator("customer_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("Telefon raqami noto'g'ri formatda")
        return v


class MyOrdersRequest(BaseModel):
    """Mijoz brauzerida saqlangan buyurtma kalitlari (login yo'q — kalit egasi buyurtma egasi)."""

    tokens: list[str] = Field(max_length=100)


class FindOrderRequest(BaseModel):
    """Boshqa qurilmadan topish: buyurtma raqami VA telefon ikkalasi mos kelishi shart."""

    order_number: str = Field(min_length=3, max_length=20)
    customer_phone: str = Field(min_length=7, max_length=50)

    @field_validator("order_number")
    @classmethod
    def _number(cls, v: str) -> str:
        return v.strip().upper()


class DemoPaymentRequest(BaseModel):
    # Karta raqami serverga YUBORILMAYDI — faqat oxirgi 4 raqam (chek uchun)
    card_last4: str = Field(pattern=r"^\d{4}$")


class PublicOrderItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_name: str
    product_code: str
    size: str | None = None
    color: str | None = None
    unit_price: float
    quantity: int
    line_total: float


class PaymentInfo(BaseModel):
    provider: str
    test_mode: bool
    # Haqiqiy provayderlarda (Payme/Click) — to'lov sahifasi manzili
    checkout_url: str | None = None


class PublicOrder(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_number: str | None
    public_token: str
    factory_id: int
    factory_name: str
    customer_name: str
    customer_phone: str
    delivery_address: str | None
    status: OrderStatus
    payment_status: PaymentStatus
    card_last4: str | None
    total_amount: float
    currency: str
    items: list[PublicOrderItem]
    created_at: datetime
    paid_at: datetime | None


class CheckoutResponse(BaseModel):
    order: PublicOrder
    payment: PaymentInfo
