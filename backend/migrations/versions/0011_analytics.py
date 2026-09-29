"""Tahlil: fabrika sozlamalari (tannarx, ogohlantirish chegaralari) va bildirishnomalar o'qilgan holati

Revision ID: 0011_analytics
Revises: 0010_procurement_logistics
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011_analytics"
down_revision: str | None = "0010_procurement_logistics"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "factory_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("overhead_percent", sa.Numeric(6, 2), nullable=False),
        sa.Column("monthly_work_hours", sa.Numeric(6, 1), nullable=False),
        sa.Column("defect_alert_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("low_margin_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "notification_reads",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(120), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "key", name="uq_notification_reads_user_key"),
    )
    op.create_index("ix_notification_reads_user_id", "notification_reads", ["user_id"])


def downgrade() -> None:
    op.drop_table("notification_reads")
    op.drop_table("factory_settings")
