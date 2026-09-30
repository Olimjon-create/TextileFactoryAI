import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.factory import Factory


class JoinRequestStatus(str, enum.Enum):
    AWAITING_CONTACT = "AWAITING_CONTACT"
    NEW = "NEW"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class EmployeeJoinRequest(Base):
    """Telegram bot orqali ishga qo'shilish so'rovi: xodim zavod havolasini ochib kontaktini yuboradi,
    rahbar (saytda yoki botda) qabul qiladi — shunda Employee yaratiladi va bot kabinetiga ulanadi."""

    __tablename__ = "employee_join_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    telegram_chat_id: Mapped[str] = mapped_column(String(32), index=True)
    telegram_lang: Mapped[str | None] = mapped_column(String(2))
    full_name: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[JoinRequestStatus] = mapped_column(
        Enum(JoinRequestStatus, name="join_request_status"), default=JoinRequestStatus.AWAITING_CONTACT, index=True
    )
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    factory: Mapped["Factory"] = relationship()
