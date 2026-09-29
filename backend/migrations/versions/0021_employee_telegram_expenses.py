"""Xodimning Telegram chati va zavod xarajatlari

Revision ID: 0021_employee_telegram_expenses
Revises: 0020_payroll
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_employee_telegram_expenses"
down_revision: str | None = "0020_payroll"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATEGORIES = ("RENT", "UTILITIES", "TAX", "TRANSPORT", "MAINTENANCE", "MARKETING", "OFFICE", "OTHER")


def upgrade() -> None:
    with op.batch_alter_table("employees") as batch:
        batch.add_column(sa.Column("telegram_chat_id", sa.String(32), nullable=True))
        batch.add_column(sa.Column("telegram_lang", sa.String(2), nullable=True))
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("category", sa.Enum(*CATEGORIES, name="expense_category"), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.String(300), nullable=True),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_expenses_factory_id", "expenses", ["factory_id"])
    op.create_index("ix_expenses_expense_date", "expenses", ["expense_date"])
    op.create_index("ix_expenses_category", "expenses", ["category"])


def downgrade() -> None:
    op.drop_table("expenses")
    sa.Enum(name="expense_category").drop(op.get_bind(), checkfirst=True)
    with op.batch_alter_table("employees") as batch:
        batch.drop_column("telegram_lang")
        batch.drop_column("telegram_chat_id")
