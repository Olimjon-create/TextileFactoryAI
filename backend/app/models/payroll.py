import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AdjustmentKind(str, enum.Enum):
    BONUS = "BONUS"
    DEDUCTION = "DEDUCTION"
    ADVANCE = "ADVANCE"


class PayrollAdjustment(Base):
    __tablename__ = "payroll_adjustments"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    period: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[AdjustmentKind] = mapped_column(Enum(AdjustmentKind, name="payroll_adjustment_kind"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    note: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PayrollPayment(Base):
    __tablename__ = "payroll_payments"
    __table_args__ = (UniqueConstraint("employee_id", "period", name="uq_payroll_payments_employee_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    period: Mapped[date] = mapped_column(Date, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    paid_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
