"""Parolni tiklash tokenlari va zavodning Telegram chati

Revision ID: 0016_password_reset_telegram
Revises: 0015_rate_limit_hits
Create Date: 2026-09-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016_password_reset_telegram"
down_revision: str | None = "0015_rate_limit_hits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens", ["user_id"])
    with op.batch_alter_table("factories") as batch:
        batch.add_column(sa.Column("telegram_chat_id", sa.String(32), nullable=True))
        batch.add_column(sa.Column("telegram_lang", sa.String(2), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("factories") as batch:
        batch.drop_column("telegram_lang")
        batch.drop_column("telegram_chat_id")
    op.drop_table("password_reset_tokens")
