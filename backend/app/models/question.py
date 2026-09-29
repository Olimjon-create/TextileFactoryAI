import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.factory import Factory
    from app.models.product import Product


class QuestionStatus(str, enum.Enum):
    NEW = "NEW"
    ANSWERED = "ANSWERED"


class StoreQuestion(Base):
    __tablename__ = "store_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"))
    customer_name: Mapped[str] = mapped_column(String(200))
    customer_phone: Mapped[str] = mapped_column(String(50))
    question: Mapped[str] = mapped_column(Text)
    status: Mapped[QuestionStatus] = mapped_column(
        Enum(QuestionStatus, name="question_status"), default=QuestionStatus.NEW, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    factory: Mapped["Factory"] = relationship()
    product: Mapped["Product | None"] = relationship()
