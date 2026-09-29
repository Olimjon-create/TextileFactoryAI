"""Davomat: xodimning kelish/ketish vaqti, kechikish, ishlagan vaqti va javob (ruxsat) so'rovlari.

Attendance — xodimning bir kunlik yozuvi (bir xodim uchun kuniga bitta).
Vaqtlar zavodning mahalliy vaqtida (Time) saqlanadi; ketish kelishdan kichik bo'lsa — ertasi kuni ketgan (tungi smena).
LeaveRequest tasdiqlanganda uning kunlari uchun davomatga "javob" (LEAVE) yoki "kasal" (SICK) yozuvi qo'yiladi.
"""

import enum
from datetime import date, datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.resources import Employee
    from app.models.user import User


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"  # keldi (kechikkan bo'lsa late_minutes > 0)
    ABSENT = "ABSENT"  # sababsiz kelmadi
    LEAVE = "LEAVE"  # javob olgan (ruxsat bilan kelmadi)
    SICK = "SICK"  # kasal
    VACATION = "VACATION"  # ta'til


class LeaveType(str, enum.Enum):
    PERSONAL = "PERSONAL"  # shaxsiy ish — javob
    SICK = "SICK"  # kasallik
    VACATION = "VACATION"  # ta'til
    FAMILY = "FAMILY"  # oilaviy sabab (to'y, ma'raka)
    OTHER = "OTHER"


class LeaveStatus(str, enum.Enum):
    PENDING = "PENDING"  # ko'rib chiqilmoqda
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class LeaveRequest(Base, TimestampMixin):
    """Xodimning javob so'rovi: bir yoki bir necha kun, yoki bir kun ichida bir necha soat (start_time–end_time)."""

    __tablename__ = "leave_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    leave_type: Mapped[LeaveType] = mapped_column(Enum(LeaveType, name="leave_type"))
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date)
    # Soatbay javob (masalan 14:00–16:00) — faqat bir kunlik so'rovda
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    reason: Mapped[str] = mapped_column(String(500))
    status: Mapped[LeaveStatus] = mapped_column(
        Enum(LeaveStatus, name="leave_status"), default=LeaveStatus.PENDING, index=True
    )
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    employee: Mapped["Employee"] = relationship()
    decided_by: Mapped["User | None"] = relationship(foreign_keys=[decided_by_id])


class Attendance(Base, TimestampMixin):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("employee_id", "work_date", name="uq_attendance_employee_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), index=True)
    work_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus, name="attendance_status"), index=True)
    check_in: Mapped[time | None] = mapped_column(Time)
    check_out: Mapped[time | None] = mapped_column(Time)
    # Smena boshlanishiga nisbatan kechikish va sof ishlagan vaqt (tanaffussiz), daqiqa
    late_minutes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    worked_minutes: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(300))
    # Javob so'rovi tasdiqlanganda avtomatik qo'yilgan yozuv (so'rov bekor qilinsa o'chiriladi)
    leave_request_id: Mapped[int | None] = mapped_column(ForeignKey("leave_requests.id", ondelete="SET NULL"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    employee: Mapped["Employee"] = relationship()
