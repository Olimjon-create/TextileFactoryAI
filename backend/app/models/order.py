import enum
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.factory import Factory


class OrderStatus(str, enum.Enum):
    PENDING_PAYMENT = "PENDING_PAYMENT"  # to'lov kutilmoqda — zavodga hali ko'rinmaydi
    NEW = "NEW"  # to'langan, zavod hali ko'rib chiqmagan
    CONFIRMED = "CONFIRMED"
    IN_PRODUCTION = "IN_PRODUCTION"
    READY = "READY"
    SHIPPED = "SHIPPED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"


class OrderSource(str, enum.Enum):
    STORE = "STORE"  # mijoz katalog orqali bergan va to'lagan
    MANUAL = "MANUAL"  # menejer CRM'dagi mijoz uchun qo'lda kiritgan (B2B)


class Order(Base, TimestampMixin):
    """Buyurtma: katalog orqali (STORE) yoki menejer tomonidan (MANUAL). Bitta buyurtma — bitta zavod."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(
        ForeignKey("factories.id", ondelete="CASCADE"), index=True
    )
    # To'lovdan keyin CRM'dagi mijozga (telefon bo'yicha) bog'lanadi
    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id", ondelete="SET NULL"), index=True
    )
    order_number: Mapped[str | None] = mapped_column(String(20), unique=True, index=True)
    # Mijoz buyurtmasini ko'rishi va to'lashi uchun taxmin qilib bo'lmaydigan kalit
    public_token: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    customer_name: Mapped[str] = mapped_column(String(200))
    customer_phone: Mapped[str] = mapped_column(String(50))
    delivery_address: Mapped[str | None] = mapped_column(String(300))
    comment: Mapped[str | None] = mapped_column(Text)

    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.PENDING_PAYMENT, index=True
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.PENDING, index=True
    )
    payment_provider: Mapped[str] = mapped_column(String(30))
    payment_reference: Mapped[str | None] = mapped_column(String(100))
    card_last4: Mapped[str | None] = mapped_column(String(4))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="UZS")

    source: Mapped[OrderSource] = mapped_column(
        Enum(OrderSource, name="order_source"), default=OrderSource.STORE, server_default=OrderSource.STORE.value, index=True
    )
    # Mijozga va'da qilingan topshirish sanasi — kechikayotgan buyurtmalar shu bo'yicha aniqlanadi
    due_date: Mapped[date | None] = mapped_column(Date, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    factory: Mapped["Factory"] = relationship()
    customer: Mapped["Customer | None"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )


class OrderItem(Base):
    """Buyurtma qatori. Mahsulot nomi/kodi/narxi buyurtma paytidagi holatda saqlanadi
    (keyin mahsulot o'zgarsa yoki o'chirilsa ham buyurtma o'zgarmaydi)."""

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    product_name: Mapped[str] = mapped_column(String(200))
    product_code: Mapped[str] = mapped_column(String(50))
    # Mijoz tanlagan variant (mahsulotda o'lcham/rang bo'lmasa — NULL)
    size: Mapped[str | None] = mapped_column(String(30))
    color: Mapped[str | None] = mapped_column(String(30))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2))

    order: Mapped[Order] = relationship(back_populates="items")
