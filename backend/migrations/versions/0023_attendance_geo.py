"""Telegram bot orqali davomat uchun zavod joylashuvi

Revision ID: 0023_attendance_geo
Revises: 0022_employee_join_requests
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_attendance_geo"
down_revision: str | None = "0022_employee_join_requests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Takroriy ishga tushirishga chidamli: mavjud ustunlar qayta qo'shilmaydi.
    existing = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("factory_settings")}
    columns = [
        sa.Column("geo_enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("geo_lat", sa.Numeric(9, 6), nullable=True),
        sa.Column("geo_lng", sa.Numeric(9, 6), nullable=True),
        sa.Column("geo_radius_m", sa.Integer(), server_default="200", nullable=False),
    ]
    missing = [c for c in columns if c.name not in existing]
    if not missing:
        return
    with op.batch_alter_table("factory_settings") as batch:
        for column in missing:
            batch.add_column(column)


def downgrade() -> None:
    with op.batch_alter_table("factory_settings") as batch:
        batch.drop_column("geo_radius_m")
        batch.drop_column("geo_lng")
        batch.drop_column("geo_lat")
        batch.drop_column("geo_enabled")
