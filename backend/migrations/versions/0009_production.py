"""Ishlab chiqarish: ish buyurtmalari, partiya/qutilar (kuzatuv), bosqich amal yozuvlari

Revision ID: 0009_production
Revises: 0008_resources
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_production"
down_revision: str | None = "0008_resources"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_ENUMS = {
    "work_order_status": ("PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"),
    "log_source": ("MANUAL", "SCANNER", "CAMERA"),
    "unit_kind": ("BUNDLE", "BOX"),
}
EXISTING = {"production_stage": ("CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL", "PACKING")}


def _enum(name: str) -> sa.Enum:
    values = NEW_ENUMS.get(name) or EXISTING[name]
    return sa.Enum(*values, name=name).with_variant(postgresql.ENUM(*values, name=name, create_type=False), "postgresql")


def _fk(table: str, ondelete: str, nullable: bool = True, name: str | None = None) -> sa.Column:
    col = name or f"{table.rstrip('s')}_id"
    return sa.Column(col, sa.Integer(), sa.ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in NEW_ENUMS.items():
        sa.Enum(*values, name=name).create(bind, checkfirst=True)

    op.create_table(
        "work_orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", nullable=False, name="factory_id"),
        sa.Column("number", sa.String(20), nullable=False),
        _fk("orders", "SET NULL", name="order_id"),
        _fk("order_items", "SET NULL", name="order_item_id"),
        _fk("products", "SET NULL", name="product_id"),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("product_code", sa.String(50), nullable=False),
        sa.Column("size", sa.String(30), nullable=True),
        sa.Column("color", sa.String(30), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("overcut_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("status", _enum("work_order_status"), nullable=False),
        _fk("production_lines", "SET NULL", name="line_id"),
        sa.Column("planned_start", sa.Date(), nullable=True),
        sa.Column("planned_end", sa.Date(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        _fk("users", "SET NULL", name="created_by_id"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("factory_id", "number", name="uq_work_orders_factory_number"),
    )
    for col in ("factory_id", "number", "order_id", "order_item_id", "product_id", "status", "line_id", "planned_end"):
        op.create_index(f"ix_work_orders_{col}", "work_orders", [col])

    op.create_table(
        "tracking_units",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", nullable=False, name="factory_id"),
        _fk("work_orders", "CASCADE", nullable=False, name="work_order_id"),
        sa.Column("kind", _enum("unit_kind"), nullable=False),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("size", sa.String(30), nullable=True),
        sa.Column("color", sa.String(30), nullable=True),
        sa.Column("note", sa.String(300), nullable=True),
        _fk("users", "SET NULL", name="created_by_id"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("factory_id", "code", name="uq_tracking_units_factory_code"),
    )
    for col in ("factory_id", "work_order_id", "code"):
        op.create_index(f"ix_tracking_units_{col}", "tracking_units", [col])

    op.create_table(
        "production_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", nullable=False, name="factory_id"),
        _fk("work_orders", "CASCADE", nullable=False, name="work_order_id"),
        sa.Column("stage", _enum("production_stage"), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("quantity_good", sa.Integer(), nullable=False),
        sa.Column("quantity_defect", sa.Integer(), nullable=False),
        sa.Column("defect_reason", sa.String(300), nullable=True),
        sa.Column("fabric_used", sa.Numeric(12, 3), nullable=True),
        sa.Column("fabric_waste", sa.Numeric(12, 3), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        _fk("employees", "SET NULL", name="employee_id"),
        _fk("machines", "SET NULL", name="machine_id"),
        _fk("production_lines", "SET NULL", name="line_id"),
        _fk("shifts", "SET NULL", name="shift_id"),
        _fk("tracking_units", "SET NULL", name="unit_id"),
        sa.Column("source", _enum("log_source"), nullable=False),
        sa.Column("note", sa.String(500), nullable=True),
        _fk("users", "SET NULL", name="created_by_id"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for col in ("factory_id", "work_date", "machine_id", "line_id", "unit_id"):
        op.create_index(f"ix_production_logs_{col}", "production_logs", [col])
    op.create_index("ix_production_logs_wo_stage", "production_logs", ["work_order_id", "stage"])
    op.create_index("ix_production_logs_employee_date", "production_logs", ["employee_id", "work_date"])


def downgrade() -> None:
    for table in ("production_logs", "tracking_units", "work_orders"):
        op.drop_table(table)
    bind = op.get_bind()
    for name in NEW_ENUMS:
        sa.Enum(name=name).drop(bind, checkfirst=True)
