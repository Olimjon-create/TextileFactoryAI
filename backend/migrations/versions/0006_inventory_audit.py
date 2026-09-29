"""Ombor (materiallar, joylashuvlar, harakatlar jurnali), BOM → material bog'lanishi, audit log

Revision ID: 0006_inventory_audit
Revises: 0005_product_model_image
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_inventory_audit"
down_revision: str | None = "0005_product_model_image"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MATERIAL_TYPES = ("FABRIC", "THREAD", "BUTTON", "ZIPPER", "LABEL", "ELASTIC", "INTERLINING", "PACKAGING", "ACCESSORY", "OTHER")
MATERIAL_UNITS = ("METER", "CENTIMETER", "SQUARE_METER", "KILOGRAM", "GRAM", "PIECE", "PAIR", "SPOOL")
MOVEMENT_TYPES = ("RECEIPT", "ISSUE", "RETURN", "WRITE_OFF", "ADJUSTMENT", "TRANSFER_OUT", "TRANSFER_IN")


def _existing_enum(name: str, values: tuple[str, ...]) -> sa.Enum:
    """0001 da yaratilgan enum turi: PostgreSQL'da qayta CREATE TYPE qilinmasin."""
    return sa.Enum(*values, name=name).with_variant(
        postgresql.ENUM(*values, name=name, create_type=False), "postgresql"
    )


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "materials",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("material_type", _existing_enum("material_type", MATERIAL_TYPES), nullable=False),
        sa.Column("unit", _existing_enum("material_unit", MATERIAL_UNITS), nullable=False),
        sa.Column("color", sa.String(50), nullable=True),
        sa.Column("min_stock", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 2), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "code", name="uq_materials_factory_code"),
    )
    op.create_index("ix_materials_factory_id", "materials", ["factory_id"])
    op.create_index("ix_materials_code", "materials", ["code"])
    op.create_index("ix_materials_name", "materials", ["name"])
    op.create_index("ix_materials_material_type", "materials", ["material_type"])

    op.create_table(
        "warehouse_locations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "code", name="uq_warehouse_locations_factory_code"),
    )
    op.create_index("ix_warehouse_locations_factory_id", "warehouse_locations", ["factory_id"])

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("materials.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("location_id", sa.Integer(), sa.ForeignKey("warehouse_locations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("movement_type", sa.Enum(*MOVEMENT_TYPES, name="movement_type"), nullable=False),
        sa.Column("quantity", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit_cost", sa.Numeric(14, 2), nullable=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document_no", sa.String(50), nullable=True),
        sa.Column("note", sa.String(500), nullable=True),
        sa.Column("transfer_group", sa.String(36), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_stock_movements_factory_id", "stock_movements", ["factory_id"])
    op.create_index("ix_stock_movements_material_location", "stock_movements", ["material_id", "location_id"])
    op.create_index("ix_stock_movements_movement_type", "stock_movements", ["movement_type"])
    op.create_index("ix_stock_movements_order_id", "stock_movements", ["order_id"])
    op.create_index("ix_stock_movements_transfer_group", "stock_movements", ["transfer_group"])
    op.create_index("ix_stock_movements_created_at", "stock_movements", ["created_at"])

    with op.batch_alter_table("bom_items") as batch:
        batch.add_column(sa.Column("material_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_bom_items_material_id", "materials", ["material_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_bom_items_material_id", ["material_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_name", sa.String(200), nullable=True),
        sa.Column("entity", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("summary", sa.String(300), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_factory_id", "audit_logs", ["factory_id"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_entity", "audit_logs", ["entity", "entity_id"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    with op.batch_alter_table("bom_items") as batch:
        batch.drop_index("ix_bom_items_material_id")
        batch.drop_constraint("fk_bom_items_material_id", type_="foreignkey")
        batch.drop_column("material_id")
    op.drop_table("stock_movements")
    op.drop_table("warehouse_locations")
    op.drop_table("materials")
    # 0006 da yaratilgan enum turi (material_type/material_unit — 0001 niki, ularga tegilmaydi)
    sa.Enum(name="movement_type").drop(op.get_bind(), checkfirst=True)
