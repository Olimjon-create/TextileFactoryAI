"""Tayyor mahsulot ombori va jo'natmalar (logistika).

Tayyor mahsulot qoldig'i — jurnal yig'indisi (product_stock_movements), materiallar ombori bilan bir xil tamoyil.
Joylar umumiy (warehouse_locations). Jo'natma qatori buyurtma qatoriga bog'lanadi — mahsulot/variant
ma'lumoti takrorlanmaydi.
"""

import enum
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.inventory import WarehouseLocation
    from app.models.order import Order, OrderItem
    from app.models.product import Product
    from app.models.user import User


class ProductMovementType(str, enum.Enum):
    PRODUCTION = "PRODUCTION"
    SHIPMENT = "SHIPMENT"
    RETURN = "RETURN"
    WRITE_OFF = "WRITE_OFF"
    ADJUSTMENT = "ADJUSTMENT"
    RECEIPT = "RECEIPT"
    TRANSFER_OUT = "TRANSFER_OUT"
    TRANSFER_IN = "TRANSFER_IN"


class ShipmentStatus(str, enum.Enum):
    PREPARING = "PREPARING"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


class ProductStockMovement(Base):
    """Tayyor mahsulot harakati (o'zgarmas). quantity ishorali: kirim (+), chiqim (−)."""

    __tablename__ = "product_stock_movements"
    __table_args__ = (Index("ix_product_stock_movements_product_location", "product_id", "location_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"))
    size: Mapped[str | None] = mapped_column(String(30))
    color: Mapped[str | None] = mapped_column(String(30))
    location_id: Mapped[int] = mapped_column(ForeignKey("warehouse_locations.id", ondelete="RESTRICT"))
    movement_type: Mapped[ProductMovementType] = mapped_column(Enum(ProductMovementType, name="product_movement_type"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    work_order_id: Mapped[int | None] = mapped_column(ForeignKey("work_orders.id", ondelete="SET NULL"), index=True)
    shipment_id: Mapped[int | None] = mapped_column(ForeignKey("shipments.id", ondelete="SET NULL"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), index=True)
    note: Mapped[str | None] = mapped_column(String(500))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    product: Mapped["Product"] = relationship()
    location: Mapped["WarehouseLocation"] = relationship()
    created_by: Mapped["User | None"] = relationship()


class Shipment(Base, TimestampMixin):
    __tablename__ = "shipments"
    __table_args__ = (UniqueConstraint("factory_id", "number", name="uq_shipments_factory_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    number: Mapped[str] = mapped_column(String(20), index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    status: Mapped[ShipmentStatus] = mapped_column(
        Enum(ShipmentStatus, name="shipment_status"), default=ShipmentStatus.PREPARING, index=True
    )
    planned_date: Mapped[date | None] = mapped_column(Date, index=True)
    delivery_address: Mapped[str | None] = mapped_column(String(300))
    carrier: Mapped[str | None] = mapped_column(String(100))
    vehicle_no: Mapped[str | None] = mapped_column(String(30))
    driver_name: Mapped[str | None] = mapped_column(String(100))
    driver_phone: Mapped[str | None] = mapped_column(String(50))
    tracking_no: Mapped[str | None] = mapped_column(String(60))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    received_by: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    order: Mapped["Order"] = relationship()
    items: Mapped[list["ShipmentItem"]] = relationship(
        back_populates="shipment", cascade="all, delete-orphan", order_by="ShipmentItem.id"
    )


class ShipmentItem(Base):
    __tablename__ = "shipment_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True)
    order_item_id: Mapped[int] = mapped_column(ForeignKey("order_items.id", ondelete="CASCADE"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)

    shipment: Mapped[Shipment] = relationship(back_populates="items")
    order_item: Mapped["OrderItem"] = relationship()
