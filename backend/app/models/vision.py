"""AI / Computer Vision integratsiyasi: qurilmalar, ulardan kelgan hodisalar va hodisalarni qayta ishlash qoidalari.

Hodisa (DeviceEvent) — xom kuzatuv (kamera sanog'i, brak, mashina holati). U mavjud tizimga faqat
mavjud yo'llar orqali ta'sir qiladi: sanoq/brak → ishlab chiqarish yozuvi (production_logs, source=CAMERA),
mashina holati → machine_status_logs. Hech bir hisob (progress, KPI, tannarx) hodisalardan alohida yuritilmaydi.
Qoidalar (VisionRule) bazada — fabrika o'zi sozlaydi (ishonch chegarasi, avtomatik/qo'lda, ogohlantirish).
"""

import enum
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.models.resources import MachineStatus, ProductionStage

if TYPE_CHECKING:
    from app.models.production import WorkOrder
    from app.models.resources import Machine, ProductionLine


class DeviceKind(str, enum.Enum):
    CAMERA = "CAMERA"
    EDGE = "EDGE"
    SCANNER = "SCANNER"
    SENSOR = "SENSOR"


class EventType(str, enum.Enum):
    COUNT = "COUNT"
    DEFECT = "DEFECT"
    MACHINE_STATE = "MACHINE_STATE"
    CUSTOM = "CUSTOM"


class EventStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPLIED = "APPLIED"
    REJECTED = "REJECTED"
    STORED = "STORED"


class RuleAction(str, enum.Enum):
    AUTO_APPLY = "AUTO_APPLY"
    REVIEW = "REVIEW"
    STORE_ONLY = "STORE_ONLY"


class Device(Base, TimestampMixin):
    __tablename__ = "devices"
    __table_args__ = (UniqueConstraint("factory_id", "code", name="uq_devices_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[DeviceKind] = mapped_column(Enum(DeviceKind, name="device_kind"))
    stage: Mapped[ProductionStage | None] = mapped_column(
        Enum(ProductionStage, name="production_stage")
    )
    line_id: Mapped[int | None] = mapped_column(ForeignKey("production_lines.id", ondelete="SET NULL"), index=True)
    machine_id: Mapped[int | None] = mapped_column(ForeignKey("machines.id", ondelete="SET NULL"), index=True)
    work_order_id: Mapped[int | None] = mapped_column(ForeignKey("work_orders.id", ondelete="SET NULL"), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    key_prefix: Mapped[str] = mapped_column(String(16))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_ip: Mapped[str | None] = mapped_column(String(64))
    notes: Mapped[str | None] = mapped_column(Text)

    line: Mapped["ProductionLine | None"] = relationship()
    machine: Mapped["Machine | None"] = relationship()
    work_order: Mapped["WorkOrder | None"] = relationship()


class DeviceEvent(Base):
    __tablename__ = "device_events"
    __table_args__ = (
        UniqueConstraint("device_id", "external_id", name="uq_device_events_device_external"),
        Index("ix_device_events_factory_status", "factory_id", "status"),
        Index("ix_device_events_device_occurred", "device_id", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"))
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    external_id: Mapped[str | None] = mapped_column(String(64))
    event_type: Mapped[EventType] = mapped_column(Enum(EventType, name="event_type"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    stage: Mapped[ProductionStage | None] = mapped_column(Enum(ProductionStage, name="production_stage"))
    quantity: Mapped[int | None] = mapped_column(Integer)
    defect_reason: Mapped[str | None] = mapped_column(String(300))
    machine_state: Mapped[MachineStatus | None] = mapped_column(Enum(MachineStatus, name="machine_status"))
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(4, 3))
    work_order_id: Mapped[int | None] = mapped_column(ForeignKey("work_orders.id", ondelete="SET NULL"), index=True)
    unit_code: Mapped[str | None] = mapped_column(String(40))
    employee_code: Mapped[str | None] = mapped_column(String(30))
    image_url: Mapped[str | None] = mapped_column(String(500))
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    status: Mapped[EventStatus] = mapped_column(Enum(EventStatus, name="event_status"))
    status_message: Mapped[str | None] = mapped_column(String(300))
    production_log_id: Mapped[int | None] = mapped_column(ForeignKey("production_logs.id", ondelete="SET NULL"))
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    device: Mapped[Device] = relationship()


class VisionRule(Base, TimestampMixin):
    """Hodisa turi (va ixtiyoriy aniq qurilma) uchun qayta ishlash qoidasi. Qurilma qoidasi umumiydan ustun."""

    __tablename__ = "vision_rules"
    __table_args__ = (UniqueConstraint("factory_id", "event_type", "device_id", name="uq_vision_rules_scope"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType, name="event_type"))
    device_id: Mapped[int | None] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    action: Mapped[RuleAction] = mapped_column(Enum(RuleAction, name="rule_action"))
    min_confidence: Mapped[Decimal] = mapped_column(Numeric(4, 3), default=Decimal("0.8"))
    alert_threshold: Mapped[int | None] = mapped_column(Integer)
    alert_window_minutes: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    notes: Mapped[str | None] = mapped_column(String(300))

    device: Mapped[Device | None] = relationship()
