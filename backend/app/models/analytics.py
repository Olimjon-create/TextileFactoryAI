"""Tahlil: fabrika sozlamalari (tannarx va ogohlantirish chegaralari) va bildirishnomalarning o'qilgan holati.

Tannarx, dashboard, hisobot va bildirishnomalar alohida saqlanmaydi — mavjud jurnallardan hisoblanadi.
Bu yerda faqat fabrikaning o'zi sozlaydigan qiymatlar (kodga qattiq yozilmaydi).
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin

# Sozlama hali saqlanmagan fabrika uchun boshlang'ich qiymatlar (fabrika o'zi o'zgartiradi)
SETTINGS_DEFAULTS = {
    "overhead_percent": Decimal("0"),
    "monthly_work_hours": Decimal("208"),
    "defect_alert_percent": Decimal("5"),
    "low_margin_percent": Decimal("10"),
}


class FactorySettings(Base, TimestampMixin):
    __tablename__ = "factory_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), unique=True)
    # Umumiy xarajatlar (ijara, elektr, boshqaruv): material + ish haqi ustiga foiz
    overhead_percent: Mapped[Decimal] = mapped_column(Numeric(6, 2), default=SETTINGS_DEFAULTS["overhead_percent"])
    # Oylik maoshli xodimning soatlik narxi = oylik / shu soat (ish vaqti yozuvlari bo'yicha taqsimlash)
    monthly_work_hours: Mapped[Decimal] = mapped_column(Numeric(6, 1), default=SETTINGS_DEFAULTS["monthly_work_hours"])
    # Ish buyurtmasida brak ulushi shundan oshsa — ogohlantirish
    defect_alert_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=SETTINGS_DEFAULTS["defect_alert_percent"])
    # Buyurtma foydasi shundan past bo'lsa — ogohlantirish
    low_margin_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), default=SETTINGS_DEFAULTS["low_margin_percent"])


class NotificationRead(Base):
    """Foydalanuvchi o'qigan bildirishnoma kaliti (bildirishnomaning o'zi hisoblanadi)."""

    __tablename__ = "notification_reads"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_notification_reads_user_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(120))
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
