"""Buyurtma qatorida mijoz tanlagan o'lcham va rang

Revision ID: 0004_order_item_variants
Revises: 0003_storefront_orders
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_order_item_variants"
down_revision: str | None = "0003_storefront_orders"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("order_items") as batch:
        batch.add_column(sa.Column("size", sa.String(30), nullable=True))
        batch.add_column(sa.Column("color", sa.String(30), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("order_items") as batch:
        batch.drop_column("color")
        batch.drop_column("size")
