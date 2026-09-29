"""Resurslar: ishlab chiqarish liniyalari, smenalar, xodimlar, mashinalar, holat tarixi, texnik xizmat

Revision ID: 0008_resources
Revises: 0007_order_source_due_date
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_resources"
down_revision: str | None = "0007_order_source_due_date"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUMS = {
    "production_stage": ("CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL", "PACKING"),
    "department": ("CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL", "PACKING", "WAREHOUSE", "MAINTENANCE", "ADMINISTRATION", "OTHER"),
    "pay_type": ("MONTHLY", "HOURLY", "PIECE"),
    "employee_status": ("ACTIVE", "ON_LEAVE", "TERMINATED"),
    "machine_type": (
        "CUTTING", "SPREADING", "LOCKSTITCH", "OVERLOCK", "COVERSTITCH", "BUTTONHOLE", "BUTTON_ATTACH",
        "BARTACK", "EMBROIDERY", "PRINTING", "PRESS", "KNITTING", "OTHER",
    ),
    "machine_status": ("WORKING", "IDLE", "BROKEN", "MAINTENANCE"),
    "maintenance_kind": ("PREVENTIVE", "REPAIR"),
}


def _enum(name: str) -> sa.Enum:
    """Enum turi upgrade() boshida bir marta yaratiladi — jadvallar uni qayta yaratmasin (PostgreSQL)."""
    values = ENUMS[name]
    return sa.Enum(*values, name=name).with_variant(postgresql.ENUM(*values, name=name, create_type=False), "postgresql")


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def _factory() -> sa.Column:
    return sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False)


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in ENUMS.items():
        sa.Enum(*values, name=name).create(bind, checkfirst=True)

    op.create_table(
        "production_lines",
        sa.Column("id", sa.Integer(), primary_key=True),
        _factory(),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("stage", _enum("production_stage"), nullable=False),
        sa.Column("capacity_per_shift", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "code", name="uq_production_lines_factory_code"),
    )
    op.create_index("ix_production_lines_factory_id", "production_lines", ["factory_id"])

    op.create_table(
        "shifts",
        sa.Column("id", sa.Integer(), primary_key=True),
        _factory(),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("break_minutes", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_shifts_factory_id", "shifts", ["factory_id"])

    op.create_table(
        "employees",
        sa.Column("id", sa.Integer(), primary_key=True),
        _factory(),
        sa.Column("employee_code", sa.String(30), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("position", sa.String(100), nullable=True),
        sa.Column("department", _enum("department"), nullable=False),
        sa.Column("line_id", sa.Integer(), sa.ForeignKey("production_lines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("shifts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("hire_date", sa.Date(), nullable=True),
        sa.Column("pay_type", _enum("pay_type"), nullable=False),
        sa.Column("pay_rate", sa.Numeric(14, 2), nullable=True),
        sa.Column("daily_norm", sa.Integer(), nullable=True),
        sa.Column("status", _enum("employee_status"), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "employee_code", name="uq_employees_factory_code"),
        sa.UniqueConstraint("user_id"),
    )
    for col in ("factory_id", "employee_code", "full_name", "department", "line_id", "shift_id", "status"):
        op.create_index(f"ix_employees_{col}", "employees", [col])

    op.create_table(
        "machines",
        sa.Column("id", sa.Integer(), primary_key=True),
        _factory(),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("machine_type", _enum("machine_type"), nullable=False),
        sa.Column("brand", sa.String(100), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("serial_number", sa.String(100), nullable=True),
        sa.Column("line_id", sa.Integer(), sa.ForeignKey("production_lines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", _enum("machine_status"), nullable=False),
        sa.Column("status_since", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("purchase_date", sa.Date(), nullable=True),
        sa.Column("maintenance_interval_days", sa.Integer(), nullable=True),
        sa.Column("last_maintenance_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "code", name="uq_machines_factory_code"),
    )
    for col in ("factory_id", "code", "machine_type", "line_id", "status"):
        op.create_index(f"ix_machines_{col}", "machines", [col])

    op.create_table(
        "machine_status_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        _factory(),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", _enum("machine_status"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reason", sa.String(300), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_machine_status_logs_factory_id", "machine_status_logs", ["factory_id"])
    op.create_index("ix_machine_status_logs_machine_started", "machine_status_logs", ["machine_id", "started_at"])

    op.create_table(
        "machine_maintenance",
        sa.Column("id", sa.Integer(), primary_key=True),
        _factory(),
        sa.Column("machine_id", sa.Integer(), sa.ForeignKey("machines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", _enum("maintenance_kind"), nullable=False),
        sa.Column("performed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("parts_used", sa.String(500), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("cost", sa.Numeric(14, 2), nullable=True),
        sa.Column("technician_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("technician_name", sa.String(200), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    for col in ("factory_id", "machine_id", "performed_at"):
        op.create_index(f"ix_machine_maintenance_{col}", "machine_maintenance", [col])


def downgrade() -> None:
    for table in ("machine_maintenance", "machine_status_logs", "machines", "employees", "shifts", "production_lines"):
        op.drop_table(table)
    bind = op.get_bind()
    for name in ENUMS:
        sa.Enum(name=name).drop(bind, checkfirst=True)
