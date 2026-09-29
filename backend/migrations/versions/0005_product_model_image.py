"""Mahsulotning odam (model) ustidagi rasmi

Revision ID: 0005_product_model_image
Revises: 0004_order_item_variants
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_product_model_image"
down_revision: str | None = "0004_order_item_variants"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("products") as batch:
        batch.add_column(sa.Column("model_image_url", sa.String(500), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("products") as batch:
        batch.drop_column("model_image_url")
