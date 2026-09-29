"""AI / Computer Vision: qurilmalar, hodisalar, qayta ishlash qoidalari

Revision ID: 0012_vision
Revises: 0011_analytics
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_vision"
down_revision: str | None = "0011_analytics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_ENUMS = {
    "device_kind": ("CAMERA", "EDGE", "SCANNER", "SENSOR"),
    "event_type": ("COUNT", "DEFECT", "MACHINE_STATE", "CUSTOM"),
    "event_status": ("PENDING", "APPLIED", "REJECTED", "STORED"),
    "rule_action": ("AUTO_APPLY", "REVIEW", "STORE_ONLY"),
}
EXISTING = {
    "production_stage": ("CUTTING", "SEWING", "FINISHING", "QUALITY_CONTROL", "PACKING"),
    "machine_status": ("WORKING", "IDLE", "BROKEN", "MAINTENANCE"),
}


def _enum(name: str) -> sa.Enum:
    values = NEW_ENUMS.get(name) or EXISTING[name]
    return sa.Enum(*values, name=name).with_variant(postgresql.ENUM(*values, name=name, create_type=False), "postgresql")


def _fk(table: str, ondelete: str, name: str, nullable: bool = True) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in NEW_ENUMS.items():
        sa.Enum(*values, name=name).create(bind, checkfirst=True)

    op.create_table(
        "devices",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        sa.Column("code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", _enum("device_kind"), nullable=False),
        sa.Column("stage", _enum("production_stage"), nullable=True),
        _fk("production_lines", "SET NULL", "line_id"),
        _fk("machines", "SET NULL", "machine_id"),
        _fk("work_orders", "SET NULL", "work_order_id"),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("key_prefix", sa.String(16), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_ip", sa.String(64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("factory_id", "code", name="uq_devices_factory_code"),
    )
    for col in ("factory_id", "line_id", "machine_id", "work_order_id"):
        op.create_index(f"ix_devices_{col}", "devices", [col])

    op.create_table(
        "device_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        _fk("devices", "CASCADE", "device_id", nullable=False),
        sa.Column("external_id", sa.String(64), nullable=True),
        sa.Column("event_type", _enum("event_type"), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("stage", _enum("production_stage"), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("defect_reason", sa.String(300), nullable=True),
        sa.Column("machine_state", _enum("machine_status"), nullable=True),
        sa.Column("confidence", sa.Numeric(4, 3), nullable=True),
        _fk("work_orders", "SET NULL", "work_order_id"),
        sa.Column("unit_code", sa.String(40), nullable=True),
        sa.Column("employee_code", sa.String(30), nullable=True),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("status", _enum("event_status"), nullable=False),
        sa.Column("status_message", sa.String(300), nullable=True),
        _fk("production_logs", "SET NULL", "production_log_id"),
        _fk("users", "SET NULL", "reviewed_by_id"),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("device_id", "external_id", name="uq_device_events_device_external"),
    )
    op.create_index("ix_device_events_event_type", "device_events", ["event_type"])
    op.create_index("ix_device_events_work_order_id", "device_events", ["work_order_id"])
    op.create_index("ix_device_events_factory_status", "device_events", ["factory_id", "status"])
    op.create_index("ix_device_events_device_occurred", "device_events", ["device_id", "occurred_at"])

    op.create_table(
        "vision_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        sa.Column("event_type", _enum("event_type"), nullable=False),
        _fk("devices", "CASCADE", "device_id"),
        sa.Column("action", _enum("rule_action"), nullable=False),
        sa.Column("min_confidence", sa.Numeric(4, 3), nullable=False),
        sa.Column("alert_threshold", sa.Integer(), nullable=True),
        sa.Column("alert_window_minutes", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("notes", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("factory_id", "event_type", "device_id", name="uq_vision_rules_scope"),
    )
    op.create_index("ix_vision_rules_factory_id", "vision_rules", ["factory_id"])


def downgrade() -> None:
    op.drop_table("vision_rules")
    op.drop_table("device_events")
    op.drop_table("devices")
    bind = op.get_bind()
    for name in NEW_ENUMS:
        sa.Enum(name=name).drop(bind, checkfirst=True)
