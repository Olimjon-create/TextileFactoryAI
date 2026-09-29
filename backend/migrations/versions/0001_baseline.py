"""Baseline: foundation (factories, users) va Product/BOM jadvallari

Alembic joriy qilinishidan oldin create_all bilan yaratilgan sxemaning aynan nusxasi.
Bunday mavjud bazalar app.core.migrations tomonidan avtomatik shu versiyaga "stamp" qilinadi.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-09-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

user_role = sa.Enum(
    "SUPER_ADMIN",
    "FACTORY_OWNER",
    "MANAGER",
    "PRODUCTION_MANAGER",
    "WAREHOUSE_MANAGER",
    "QUALITY_MANAGER",
    "WORKER",
    name="user_role",
)
production_unit = sa.Enum("PIECE", "PAIR", "SET", "DOZEN", name="production_unit")
product_status = sa.Enum("DRAFT", "ACTIVE", "ARCHIVED", name="product_status")
material_type = sa.Enum(
    "FABRIC",
    "THREAD",
    "BUTTON",
    "ZIPPER",
    "LABEL",
    "ELASTIC",
    "INTERLINING",
    "PACKAGING",
    "ACCESSORY",
    "OTHER",
    name="material_type",
)
material_unit = sa.Enum(
    "METER",
    "CENTIMETER",
    "SQUARE_METER",
    "KILOGRAM",
    "GRAM",
    "PIECE",
    "PAIR",
    "SPOOL",
    name="material_unit",
)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "factories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.String(300), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *_timestamps(),
    )
    op.create_index(op.f("ix_factories_name"), "factories", ["name"])

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "factory_id",
            sa.Integer(),
            sa.ForeignKey("factories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        *_timestamps(),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_index(op.f("ix_users_factory_id"), "users", ["factory_id"])

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "factory_id",
            sa.Integer(),
            sa.ForeignKey("factories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sizes", sa.JSON(), nullable=False),
        sa.Column("colors", sa.JSON(), nullable=False),
        sa.Column("unit", production_unit, nullable=False),
        sa.Column("status", product_status, nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("factory_id", "code", name="uq_products_factory_code"),
    )
    op.create_index(op.f("ix_products_factory_id"), "products", ["factory_id"])
    op.create_index(op.f("ix_products_name"), "products", ["name"])
    op.create_index(op.f("ix_products_code"), "products", ["code"])
    op.create_index(op.f("ix_products_category"), "products", ["category"])
    op.create_index(op.f("ix_products_status"), "products", ["status"])

    op.create_table(
        "bom_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "product_id",
            sa.Integer(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("material_type", material_type, nullable=False),
        sa.Column("material_name", sa.String(200), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 4), nullable=False),
        sa.Column("unit", material_unit, nullable=False),
        sa.Column("waste_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("notes", sa.String(500), nullable=True),
        *_timestamps(),
    )
    op.create_index(op.f("ix_bom_items_product_id"), "bom_items", ["product_id"])


def downgrade() -> None:
    op.drop_table("bom_items")
    op.drop_table("products")
    op.drop_table("users")
    op.drop_table("factories")
    bind = op.get_bind()
    for enum in (material_unit, material_type, product_status, production_unit, user_role):
        enum.drop(bind, checkfirst=True)
