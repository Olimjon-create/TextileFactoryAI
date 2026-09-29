"""Davomat: xodimlarning kelish/ketish yozuvlari va javob (ruxsat) so'rovlari

Revision ID: 0013_attendance
Revises: 0012_vision
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013_attendance"
down_revision: str | None = "0012_vision"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_ENUMS = {
    "attendance_status": ("PRESENT", "ABSENT", "LEAVE", "SICK", "VACATION"),
    "leave_type": ("PERSONAL", "SICK", "VACATION", "FAMILY", "OTHER"),
    "leave_status": ("PENDING", "APPROVED", "REJECTED"),
}


def _enum(name: str) -> sa.Enum:
    values = NEW_ENUMS[name]
    return sa.Enum(*values, name=name).with_variant(postgresql.ENUM(*values, name=name, create_type=False), "postgresql")


def _fk(table: str, ondelete: str, name: str, nullable: bool = True) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey(f"{table}.id", ondelete=ondelete), nullable=nullable)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in NEW_ENUMS.items():
        sa.Enum(*values, name=name).create(bind, checkfirst=True)

    op.create_table(
        "leave_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        _fk("employees", "CASCADE", "employee_id", nullable=False),
        sa.Column("leave_type", _enum("leave_type"), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("reason", sa.String(500), nullable=False),
        sa.Column("status", _enum("leave_status"), nullable=False),
        _fk("users", "SET NULL", "decided_by_id"),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision_note", sa.String(300), nullable=True),
        _fk("users", "SET NULL", "created_by_id"),
        *_timestamps(),
    )
    op.create_index("ix_leave_requests_factory_id", "leave_requests", ["factory_id"])
    op.create_index("ix_leave_requests_employee_id", "leave_requests", ["employee_id"])
    op.create_index("ix_leave_requests_start_date", "leave_requests", ["start_date"])
    op.create_index("ix_leave_requests_status", "leave_requests", ["status"])

    op.create_table(
        "attendance",
        sa.Column("id", sa.Integer(), primary_key=True),
        _fk("factories", "CASCADE", "factory_id", nullable=False),
        _fk("employees", "CASCADE", "employee_id", nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("status", _enum("attendance_status"), nullable=False),
        sa.Column("check_in", sa.Time(), nullable=True),
        sa.Column("check_out", sa.Time(), nullable=True),
        sa.Column("late_minutes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("worked_minutes", sa.Integer(), nullable=True),
        sa.Column("note", sa.String(300), nullable=True),
        _fk("leave_requests", "SET NULL", "leave_request_id"),
        _fk("users", "SET NULL", "created_by_id"),
        *_timestamps(),
        sa.UniqueConstraint("employee_id", "work_date", name="uq_attendance_employee_date"),
    )
    op.create_index("ix_attendance_factory_id", "attendance", ["factory_id"])
    op.create_index("ix_attendance_employee_id", "attendance", ["employee_id"])
    op.create_index("ix_attendance_work_date", "attendance", ["work_date"])
    op.create_index("ix_attendance_status", "attendance", ["status"])
    op.create_index("ix_attendance_leave_request_id", "attendance", ["leave_request_id"])


def downgrade() -> None:
    op.drop_table("attendance")
    op.drop_table("leave_requests")
    bind = op.get_bind()
    for name in NEW_ENUMS:
        sa.Enum(name=name).drop(bind, checkfirst=True)
