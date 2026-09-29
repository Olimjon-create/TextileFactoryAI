"""Tayyor mahsulot: qo'lda kirim va joydan joyga ko'chirish harakatlari

Revision ID: 0014_fg_receipt_transfer
Revises: 0013_attendance
Create Date: 2026-09-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_fg_receipt_transfer"
down_revision: str | None = "0013_attendance"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_VALUES = ("PRODUCTION", "SHIPMENT", "RETURN", "WRITE_OFF", "ADJUSTMENT")
NEW_VALUES = ("RECEIPT", "TRANSFER_OUT", "TRANSFER_IN")


def _sqlite_column(values: tuple[str, ...]) -> None:
    # SQLite'da enum — VARCHAR(eng uzun qiymat); yangi qiymatlar uzunroq ("TRANSFER_OUT"), ustun qayta quriladi
    with op.batch_alter_table("product_stock_movements") as batch:
        batch.alter_column("movement_type", type_=sa.Enum(*values, name="product_movement_type"), existing_nullable=False)


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for value in NEW_VALUES:
            op.execute(f"ALTER TYPE product_movement_type ADD VALUE IF NOT EXISTS '{value}'")
    else:
        _sqlite_column(OLD_VALUES + NEW_VALUES)


def downgrade() -> None:
    # PostgreSQL enum'dan qiymatni o'chirib bo'lmaydi; bu harakatlar bo'lsa ular qoladi
    if op.get_bind().dialect.name != "postgresql":
        _sqlite_column(OLD_VALUES)
