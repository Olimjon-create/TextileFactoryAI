"""Buyurtma manbasi (katalog / qo'lda), topshirish muddati va kim kiritgani

Revision ID: 0007_order_source_due_date
Revises: 0006_inventory_audit
Create Date: 2026-09-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_order_source_due_date"
down_revision: str | None = "0006_inventory_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

order_source = sa.Enum("STORE", "MANUAL", name="order_source")


def upgrade() -> None:
    order_source.create(op.get_bind(), checkfirst=True)
    with op.batch_alter_table("orders") as batch:
        batch.add_column(sa.Column("source", order_source, server_default="STORE", nullable=False))
        batch.add_column(sa.Column("due_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("created_by_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_orders_created_by_id", "users", ["created_by_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_orders_source", ["source"])
        batch.create_index("ix_orders_due_date", ["due_date"])


def downgrade() -> None:
    with op.batch_alter_table("orders") as batch:
        batch.drop_index("ix_orders_due_date")
        batch.drop_index("ix_orders_source")
        batch.drop_constraint("fk_orders_created_by_id", type_="foreignkey")
        batch.drop_column("created_by_id")
        batch.drop_column("due_date")
        batch.drop_column("source")
    order_source.drop(op.get_bind(), checkfirst=True)
