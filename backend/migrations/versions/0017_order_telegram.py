"""Buyurtmaning Telegram mijozi (bot Mini App orqali berilgan buyurtmalar)

Revision ID: 0017_order_telegram
Revises: 0016_password_reset_telegram
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_order_telegram"
down_revision: str | None = "0016_password_reset_telegram"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("customer_telegram_id", sa.String(32), nullable=True))
        batch.add_column(sa.Column("customer_lang", sa.String(2), nullable=True))
    op.create_index("ix_orders_customer_telegram_id", "orders", ["customer_telegram_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_customer_telegram_id", "orders")
    with op.batch_alter_table("orders") as batch:
        batch.drop_column("customer_lang")
        batch.drop_column("customer_telegram_id")
