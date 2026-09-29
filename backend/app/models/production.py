"""Ishlab chiqarish: ish buyurtmalari, bosqich amal yozuvlari, partiya/qutilar (kuzatuv).

Amal yozuvi (ProductionLog) — bosqich ishining yagona manbai: progress, xodim KPI, sifat va
buyurtma holati shundan hisoblanadi. `source` — yozuv qayerdan kelgani (qo'lda / skaner / kamera):
kelajakdagi Computer Vision sanog'i ham shu jadvalga tushadi.
"""

import enum
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.resources import ProductionStage

if TYPE_CHECKING:
    from app.models.order import Order
    from app.models.product import Product
    from app.models.resources import Employee, Machine, ProductionLine, Shift
    from app.models.user import User

STAGE_ROUTE: tuple[ProductionStage, ...] = (
    ProductionStage.CUTTING,
    ProductionStage.SEWING,
    ProductionStage.FINISHING,
    ProductionStage.QUALITY_CONTROL,
    ProductionStage.PACKING,
)


class WorkOrderStatus(str, enum.Enum):
    PLANNED = "PLANNED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class LogSource(str, enum.Enum):
    MANUAL = "MANUAL"
    SCANNER = "SCANNER"
    CAMERA = "CAMERA"


class UnitKind(str, enum.Enum):
    BUNDLE = "BUNDLE"
    BOX = "BOX"


class WorkOrder(Base, TimestampMixin):
    __tablename__ = "work_orders"
    __table_args__ = (UniqueConstraint("factory_id", "number", name="uq_work_orders_factory_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    number: Mapped[str] = mapped_column(String(20), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    order_item_id: Mapped[int | None] = mapped_column(ForeignKey("order_items.id", ondelete="SET NULL"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), index=True)
    product_name: Mapped[str] = mapped_column(String(200))
    product_code: Mapped[str] = mapped_column(String(50))
    size: Mapped[str | None] = mapped_column(String(30))
    color: Mapped[str | None] = mapped_column(String(30))
    quantity: Mapped[int] = mapped_column(Integer)
    overcut_pct: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=0)
    status: Mapped[WorkOrderStatus] = mapped_column(
        Enum(WorkOrderStatus, name="work_order_status"), default=WorkOrderStatus.PLANNED, index=True
    )
    line_id: Mapped[int | None] = mapped_column(ForeignKey("production_lines.id", ondelete="SET NULL"), index=True)
    planned_start: Mapped[date | None] = mapped_column(Date)
    planned_end: Mapped[date | None] = mapped_column(Date, index=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    order: Mapped["Order | None"] = relationship()
    product: Mapped["Product | None"] = relationship()
    line: Mapped["ProductionLine | None"] = relationship()


class ProductionLog(Base):
    """Bosqichdagi ish yozuvi (o'zgarmas; xato bo'lsa — teskari yozuv emas, bekor qilish endpointi orqali)."""

    __tablename__ = "production_logs"
    __table_args__ = (
        Index("ix_production_logs_wo_stage", "work_order_id", "stage"),
        Index("ix_production_logs_employee_date", "employee_id", "work_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id", ondelete="CASCADE"))
    stage: Mapped[ProductionStage] = mapped_column(Enum(ProductionStage, name="production_stage"))
    work_date: Mapped[date] = mapped_column(Date, index=True)
    quantity_good: Mapped[int] = mapped_column(Integer, default=0)
    quantity_defect: Mapped[int] = mapped_column(Integer, default=0)
    defect_reason: Mapped[str | None] = mapped_column(String(300))
    fabric_used: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    fabric_waste: Mapped[Decimal | None] = mapped_column(Numeric(12, 3))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id", ondelete="SET NULL"), index=True)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("production_lines.id", ondelete="SET NULL"), index=True)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id", ondelete="SET NULL"))
    unit_id: Mapped[int | None] = mapped_column(ForeignKey("tracking_units.id", ondelete="SET NULL"), index=True)
    source: Mapped[LogSource] = mapped_column(Enum(LogSource, name="log_source"), default=LogSource.MANUAL)
    note: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    employee: Mapped["Employee | None"] = relationship()
    machine: Mapped["Machine | None"] = relationship()
    line: Mapped["ProductionLine | None"] = relationship()
    shift: Mapped["Shift | None"] = relationship()
    unit: Mapped["TrackingUnit | None"] = relationship()
    created_by: Mapped["User | None"] = relationship()


class TrackingUnit(Base):
    """Kuzatiladigan birlik: kesilgan partiya (BUNDLE) yoki qadoqlangan quti (BOX). code — QR/shtrix-kodga bosiladi."""

    __tablename__ = "tracking_units"
    __table_args__ = (UniqueConstraint("factory_id", "code", name="uq_tracking_units_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    work_order_id: Mapped[int] = mapped_column(ForeignKey("work_orders.id", ondelete="CASCADE"), index=True)
    kind: Mapped[UnitKind] = mapped_column(Enum(UnitKind, name="unit_kind"))
    code: Mapped[str] = mapped_column(String(40), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    size: Mapped[str | None] = mapped_column(String(30))
    color: Mapped[str | None] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    work_order: Mapped[WorkOrder] = relationship()
