"""Ta'minot va logistika: yetkazib beruvchilar, xarid buyurtmalari, tayyor mahsulot ombori, jo'natmalar

Revision ID: 0010_procurement_logistics
Revises: 0009_production
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_procurement_logistics"
down_revision: str | None = "0009_production"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_ENUMS = {
    "purchase_status": ("DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CLOSED", "CANCELLED"),
    "product_movement_type": ("PRODUCTION", "SHIPMENT", "RETURN", "WRITE_OFF", "ADJUSTMENT"),
    "shipment_status": ("PREPARING", "SHIPPED", "DELIVERED", "CANCELLED"),
}


def _enum(name: str) -> sa.Enum:
    values = NEW_ENUMS[name]
    return sa.Enum(*values, name=name).with_variant(postgresql.ENUM(*values, name=name, create_type=False), "postgresql")


def _fk(table: str, ondelete: str, name: str, nullable: bool = True) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _indexes(table: str, cols: tuple[str, ...]) -> None:
    for col in cols:
        op.create_index(f"ix_{table}_{col}", table, [col])


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in NEW_ENUMS.items():
        sa.Enum(*values, name=name).create(bind, checkfirst=True)

    op.create_table(
        "suppliers",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_person", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("country", sa.String(2), nullable=True),
        sa.Column("address", sa.String(300), nullable=True),
        sa.Column("tax_id", sa.String(30), nullable=True),
        sa.Column("payment_terms_days", sa.Integer(), nullable=True),
        sa.Column("lead_time_days", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "code", name="uq_suppliers_factory_code"),
    )
    _indexes("suppliers", ("factory_id", "code", "name"))

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        _fk("suppliers", "RESTRICT", "supplier_id", nullable=False),
        sa.Column("status", _enum("purchase_status"), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=False),
        sa.Column("expected_date", sa.Date(), nullable=True),
        _fk("orders", "SET NULL", "order_id"),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("ordered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        _fk("users", "SET NULL", "created_by_id"),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "number", name="uq_purchase_orders_factory_number"),
    )
    _indexes("purchase_orders", ("factory_id", "number", "supplier_id", "status", "expected_date", "order_id"))

    op.create_table(
        "purchase_order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("purchase_orders", "CASCADE", "purchase_order_id", nullable=False),
        _fk("materials", "RESTRICT", "material_id", nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.String(300), nullable=True),
    )
    _indexes("purchase_order_items", ("purchase_order_id", "material_id"))

    with op.batch_alter_table("stock_movements") as batch:
        batch.add_column(sa.Column("purchase_item_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_stock_movements_purchase_item_id", "purchase_order_items", ["purchase_item_id"], ["id"], ondelete="SET NULL"
        )
        batch.create_index("ix_stock_movements_purchase_item_id", ["purchase_item_id"])

    op.create_table(
        "shipments",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        _fk("orders", "CASCADE", "order_id", nullable=False),
        sa.Column("status", _enum("shipment_status"), nullable=False),
        sa.Column("planned_date", sa.Date(), nullable=True),
        sa.Column("delivery_address", sa.String(300), nullable=True),
        sa.Column("carrier", sa.String(100), nullable=True),
        sa.Column("vehicle_no", sa.String(30), nullable=True),
        sa.Column("driver_name", sa.String(100), nullable=True),
        sa.Column("driver_phone", sa.String(50), nullable=True),
        sa.Column("tracking_no", sa.String(60), nullable=True),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_by", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        _fk("users", "SET NULL", "created_by_id"),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "number", name="uq_shipments_factory_number"),
    )
    _indexes("shipments", ("factory_id", "number", "order_id", "status", "planned_date"))

    op.create_table(
        "shipment_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("shipments", "CASCADE", "shipment_id", nullable=False),
        _fk("order_items", "CASCADE", "order_item_id", nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
    )
    _indexes("shipment_items", ("shipment_id", "order_item_id"))

    op.create_table(
        "product_stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        _fk("products", "RESTRICT", "product_id", nullable=False),
        sa.Column("size", sa.String(30), nullable=True),
        sa.Column("color", sa.String(30), nullable=True),
        _fk("warehouse_locations", "RESTRICT", "location_id", nullable=False),
        sa.Column("movement_type", _enum("product_movement_type"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        _fk("work_orders", "SET NULL", "work_order_id"),
        _fk("shipments", "SET NULL", "shipment_id"),
        _fk("orders", "SET NULL", "order_id"),
        sa.Column("note", sa.String(500), nullable=True),
        _fk("users", "SET NULL", "created_by_id"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    _indexes("product_stock_movements", ("factory_id", "movement_type", "work_order_id", "shipment_id", "order_id", "created_at"))
    op.create_index("ix_product_stock_movements_product_location", "product_stock_movements", ["product_id", "location_id"])


def downgrade() -> None:
    op.drop_table("product_stock_movements")
    op.drop_table("shipment_items")
    op.drop_table("shipments")
    with op.batch_alter_table("stock_movements") as batch:
        batch.drop_index("ix_stock_movements_purchase_item_id")
        batch.drop_constraint("fk_stock_movements_purchase_item_id", type_="foreignkey")
        batch.drop_column("purchase_item_id")
    op.drop_table("purchase_order_items")
    op.drop_table("purchase_orders")
    op.drop_table("suppliers")
    bind = op.get_bind()
    for name in NEW_ENUMS:
        sa.Enum(name=name).drop(bind, checkfirst=True)
