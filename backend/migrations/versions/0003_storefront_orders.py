"""Ochiq katalog va buyurtmalar: zavod profili, mahsulot narxi/rasmi, orders, order_items

Revision ID: 0003_storefront_orders
Revises: 0002_customers
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_storefront_orders"
down_revision: str | None = "0002_customers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

order_status = sa.Enum(
    "PENDING_PAYMENT",
    "NEW",
    "CONFIRMED",
    "IN_PRODUCTION",
    "READY",
    "SHIPPED",
    "COMPLETED",
    "CANCELLED",
    name="order_status",
)
payment_status = sa.Enum("PENDING", "PAID", "FAILED", "REFUNDED", name="payment_status")


def upgrade() -> None:
    with op.batch_alter_table("factories") as batch:
        batch.add_column(sa.Column("city", sa.String(100), nullable=True))
        batch.add_column(sa.Column("short_description", sa.String(200), nullable=True))
        batch.add_column(sa.Column("description", sa.Text(), nullable=True))
        batch.add_column(sa.Column("logo_url", sa.String(500), nullable=True))
        batch.add_column(sa.Column("cover_url", sa.String(500), nullable=True))
        batch.add_column(
            sa.Column("is_public", sa.Boolean(), server_default=sa.true(), nullable=False)
        )

    with op.batch_alter_table("products") as batch:
        batch.add_column(sa.Column("price", sa.Numeric(14, 2), nullable=True))
        batch.add_column(sa.Column("image_url", sa.String(500), nullable=True))

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "factory_id",
            sa.Integer(),
            sa.ForeignKey("factories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "customer_id",
            sa.Integer(),
            sa.ForeignKey("customers.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("order_number", sa.String(20), nullable=True),
        sa.Column("public_token", sa.String(64), nullable=False),
        sa.Column("customer_name", sa.String(200), nullable=False),
        sa.Column("customer_phone", sa.String(50), nullable=False),
        sa.Column("delivery_address", sa.String(300), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("status", order_status, nullable=False),
        sa.Column("payment_status", payment_status, nullable=False),
        sa.Column("payment_provider", sa.String(30), nullable=False),
        sa.Column("payment_reference", sa.String(100), nullable=True),
        sa.Column("card_last4", sa.String(4), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(op.f("ix_orders_factory_id"), "orders", ["factory_id"])
    op.create_index(op.f("ix_orders_customer_id"), "orders", ["customer_id"])
    op.create_index(op.f("ix_orders_order_number"), "orders", ["order_number"], unique=True)
    op.create_index(op.f("ix_orders_public_token"), "orders", ["public_token"], unique=True)
    op.create_index(op.f("ix_orders_status"), "orders", ["status"])
    op.create_index(op.f("ix_orders_payment_status"), "orders", ["payment_status"])

    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "order_id",
            sa.Integer(),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("product_name", sa.String(200), nullable=False),
        sa.Column("product_code", sa.String(50), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False),
    )
    op.create_index(op.f("ix_order_items_order_id"), "order_items", ["order_id"])
    op.create_index(op.f("ix_order_items_product_id"), "order_items", ["product_id"])


def downgrade() -> None:
    op.drop_table("order_items")
    op.drop_table("orders")
    bind = op.get_bind()
    payment_status.drop(bind, checkfirst=True)
    order_status.drop(bind, checkfirst=True)

    with op.batch_alter_table("products") as batch:
        batch.drop_column("image_url")
        batch.drop_column("price")

    with op.batch_alter_table("factories") as batch:
        for column in ("is_public", "cover_url", "logo_url", "description", "short_description", "city"):
            batch.drop_column(column)
