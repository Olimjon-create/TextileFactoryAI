"""Ish haqi: bonus/jarima/avans va to'lovlar

Revision ID: 0020_payroll
Revises: 0019_user_password_weak
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_payroll"
down_revision: str | None = "0019_user_password_weak"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "payroll_adjustments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.Date(), nullable=False),
        sa.Column("kind", sa.Enum("BONUS", "DEDUCTION", "ADVANCE", name="payroll_adjustment_kind"), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_payroll_adjustments_factory_id", "payroll_adjustments", ["factory_id"])
    op.create_index("ix_payroll_adjustments_employee_id", "payroll_adjustments", ["employee_id"])
    op.create_index("ix_payroll_adjustments_period", "payroll_adjustments", ["period"])
    op.create_table(
        "payroll_payments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("paid_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("employee_id", "period", name="uq_payroll_payments_employee_period"),
    )
    op.create_index("ix_payroll_payments_factory_id", "payroll_payments", ["factory_id"])
    op.create_index("ix_payroll_payments_employee_id", "payroll_payments", ["employee_id"])
    op.create_index("ix_payroll_payments_period", "payroll_payments", ["period"])


def downgrade() -> None:
    op.drop_table("payroll_payments")
    op.drop_table("payroll_adjustments")
    sa.Enum(name="payroll_adjustment_kind").drop(op.get_bind(), checkfirst=True)
