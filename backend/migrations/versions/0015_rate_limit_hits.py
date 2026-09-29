"""So'rovlar chastotasi hisoblagichi (serverless'da barcha nusxalar uchun umumiy)

Revision ID: 0015_rate_limit_hits
Revises: 0014_fg_receipt_transfer
Create Date: 2026-09-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_rate_limit_hits"
down_revision: str | None = "0014_fg_receipt_transfer"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "rate_limit_hits",
        sa.Column("key", sa.String(200), primary_key=True),
        sa.Column("window_start", sa.BigInteger(), nullable=False),
        sa.Column("hits", sa.Integer(), nullable=False),
    )
    op.create_index("ix_rate_limit_hits_window_start", "rate_limit_hits", ["window_start"])


def downgrade() -> None:
    op.drop_table("rate_limit_hits")
