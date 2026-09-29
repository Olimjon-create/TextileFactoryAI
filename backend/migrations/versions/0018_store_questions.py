"""Mijozlarning zavodga savollari

Revision ID: 0018_store_questions
Revises: 0017_order_telegram
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_store_questions"
down_revision: str | None = "0017_order_telegram"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "store_questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("factory_id", sa.Integer(), sa.ForeignKey("factories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("customer_name", sa.String(200), nullable=False),
        sa.Column("customer_phone", sa.String(50), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("status", sa.Enum("NEW", "ANSWERED", name="question_status"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_store_questions_factory_id", "store_questions", ["factory_id"])
    op.create_index("ix_store_questions_status", "store_questions", ["status"])
    op.create_index("ix_store_questions_created_at", "store_questions", ["created_at"])


def downgrade() -> None:
    op.drop_table("store_questions")
    sa.Enum(name="question_status").drop(op.get_bind(), checkfirst=True)
