import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.factory import Factory


class CustomerType(str, enum.Enum):
    COMPANY = "COMPANY"
    INDIVIDUAL = "INDIVIDUAL"


class CustomerStatus(str, enum.Enum):
    LEAD = "LEAD"
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class Customer(Base, TimestampMixin):
    """Fabrika mijozi. Har bir mijoz bitta fabrikaga tegishli va faqat o'sha fabrikaga ko'rinadi."""

    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("factory_id", "customer_code", name="uq_customers_factory_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(
        ForeignKey("factories.id", ondelete="CASCADE"), index=True
    )
    customer_code: Mapped[str] = mapped_column(String(30), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    customer_type: Mapped[CustomerType] = mapped_column(
        Enum(CustomerType, name="customer_type"), default=CustomerType.COMPANY
    )
    status: Mapped[CustomerStatus] = mapped_column(
        Enum(CustomerStatus, name="customer_status"), default=CustomerStatus.ACTIVE, index=True
    )
    contact_person: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(2), index=True)
    address: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)

    factory: Mapped["Factory"] = relationship()
