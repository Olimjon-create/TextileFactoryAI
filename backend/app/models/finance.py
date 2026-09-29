import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import User


class ExpenseCategory(str, enum.Enum):
    RENT = "RENT"
    UTILITIES = "UTILITIES"
    TAX = "TAX"
    TRANSPORT = "TRANSPORT"
    MAINTENANCE = "MAINTENANCE"
    MARKETING = "MARKETING"
    OFFICE = "OFFICE"
    OTHER = "OTHER"


class Expense(Base):
    __tablename__ = "expenses"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    expense_date: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[ExpenseCategory] = mapped_column(Enum(ExpenseCategory, name="expense_category"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    note: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    created_by: Mapped[User | None] = relationship()
