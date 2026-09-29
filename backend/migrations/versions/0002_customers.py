"""Customer/CRM moduli: customers jadvali

Revision ID: 0002_customers
Revises: 0001_baseline
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_customers"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

customer_type = sa.Enum("COMPANY", "INDIVIDUAL", name="customer_type")
customer_status = sa.Enum("LEAD", "ACTIVE", "INACTIVE", name="customer_status")


def upgrade() -> None:
    op.create_table(
        "customers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "factory_id",
            sa.Integer(),
            sa.ForeignKey("factories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("customer_code", sa.String(30), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("customer_type", customer_type, nullable=False),
        sa.Column("status", customer_status, nullable=False),
        sa.Column("contact_person", sa.String(200), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("country", sa.String(2), nullable=True),
        sa.Column("address", sa.String(300), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("factory_id", "customer_code", name="uq_customers_factory_code"),
    )
    op.create_index(op.f("ix_customers_factory_id"), "customers", ["factory_id"])
    op.create_index(op.f("ix_customers_customer_code"), "customers", ["customer_code"])
    op.create_index(op.f("ix_customers_name"), "customers", ["name"])
    op.create_index(op.f("ix_customers_status"), "customers", ["status"])
    op.create_index(op.f("ix_customers_country"), "customers", ["country"])


def downgrade() -> None:
    op.drop_table("customers")
    bind = op.get_bind()
    customer_status.drop(bind, checkfirst=True)
    customer_type.drop(bind, checkfirst=True)
