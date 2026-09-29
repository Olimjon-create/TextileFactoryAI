"""Audit log: kim, qachon, nimani o'zgartirdi (muhim jarayonlar tarixi)."""

from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditAction:
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    STATUS = "STATUS"  # holat o'zgarishi (buyurtma, ...)
    STOCK = "STOCK"  # ombor harakati


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_entity", "entity", "entity_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int | None] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    # Foydalanuvchi o'chirilsa ham tarixda kim ekani ko'rinib tursin
    user_name: Mapped[str | None] = mapped_column(String(200))
    entity: Mapped[str] = mapped_column(String(50))  # "material", "stock_movement", "product", "order", ...
    entity_id: Mapped[int | None] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(20), index=True)
    summary: Mapped[str] = mapped_column(String(300))
    # {"field": [eski, yangi]} yoki qo'shimcha ma'lumot
    changes: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
