"""Ombor (Warehouse / Inventory): materiallar katalogi, joylashuvlar va harakatlar jurnali.

Qoldiq alohida saqlanmaydi — u doim harakatlar jurnalidan hisoblanadi (SUM(quantity)).
Jurnal yozuvlari o'zgartirilmaydi va o'chirilmaydi: xato bo'lsa teskari harakat
(ADJUSTMENT yoki RETURN) kiritiladi. Shu tufayli har bir qoldiqning tarixi to'liq kuzatiladi.
"""

import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Numeric, String, UniqueConstraint, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.product import MaterialType, MaterialUnit

if TYPE_CHECKING:
    from app.models.user import User


class MovementType(str, enum.Enum):
    RECEIPT = "RECEIPT"
    ISSUE = "ISSUE"
    RETURN = "RETURN"
    WRITE_OFF = "WRITE_OFF"
    ADJUSTMENT = "ADJUSTMENT"
    TRANSFER_OUT = "TRANSFER_OUT"
    TRANSFER_IN = "TRANSFER_IN"


class Material(Base, TimestampMixin):
    """Materiallar katalogi: mato, ip, tugma, zamok, yorliq, qadoq va h.k. (zavod bo'yicha)."""

    __tablename__ = "materials"
    __table_args__ = (UniqueConstraint("factory_id", "code", name="uq_materials_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    material_type: Mapped[MaterialType] = mapped_column(Enum(MaterialType, name="material_type"), index=True)
    unit: Mapped[MaterialUnit] = mapped_column(Enum(MaterialUnit, name="material_unit"))
    color: Mapped[str | None] = mapped_column(String(50))
    min_stock: Mapped[Decimal] = mapped_column(Numeric(14, 3), default=0)
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    notes: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class WarehouseLocation(Base, TimestampMixin):
    """Ombordagi joy: bo'lim, javon, yacheyka (masalan "A-1 Mato ombori")."""

    __tablename__ = "warehouse_locations"
    __table_args__ = (UniqueConstraint("factory_id", "code", name="uq_warehouse_locations_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class StockMovement(Base):
    """Harakatlar jurnali (o'zgarmas). quantity ishorali: kirim (+), chiqim (−)."""

    __tablename__ = "stock_movements"
    __table_args__ = (Index("ix_stock_movements_material_location", "material_id", "location_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id", ondelete="RESTRICT"))
    location_id: Mapped[int] = mapped_column(ForeignKey("warehouse_locations.id", ondelete="RESTRICT"))
    movement_type: Mapped[MovementType] = mapped_column(Enum(MovementType, name="movement_type"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(14, 3))
    unit_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    purchase_item_id: Mapped[int | None] = mapped_column(ForeignKey("purchase_order_items.id", ondelete="SET NULL"), index=True)
    document_no: Mapped[str | None] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(String(500))
    transfer_group: Mapped[str | None] = mapped_column(String(36), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    material: Mapped[Material] = relationship()
    location: Mapped[WarehouseLocation] = relationship()
    created_by: Mapped["User | None"] = relationship()
