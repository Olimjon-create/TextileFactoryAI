"""Telegram orqali xodimlarning ishga qo'shilish so'rovlari

Revision ID: 0022_employee_join_requests
Revises: 0021_employee_telegram_expenses
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_employee_join_requests"
down_revision: str | None = "0021_employee_telegram_expenses"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

STATUSES = ("AWAITING_CONTACT", "NEW", "APPROVED", "REJECTED")


def upgrade() -> None:
    # Takroriy ishga tushirishga chidamli: jadval allaqachon bo'lsa (versiya yozuvi qo'lda qaytarilgan) — o'tkaziladi.
    if "employee_join_requests" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "employee_join_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("telegram_chat_id", sa.String(32), nullable=False),
        sa.Column("telegram_lang", sa.String(2), nullable=True),
        sa.Column("full_name", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("status", sa.Enum(*STATUSES, name="join_request_status"), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_employee_join_requests_factory_id", "employee_join_requests", ["factory_id"])
    op.create_index("ix_employee_join_requests_telegram_chat_id", "employee_join_requests", ["telegram_chat_id"])
    op.create_index("ix_employee_join_requests_status", "employee_join_requests", ["status"])


def downgrade() -> None:
    op.drop_table("employee_join_requests")
    sa.Enum(name="join_request_status").drop(op.get_bind(), checkfirst=True)
