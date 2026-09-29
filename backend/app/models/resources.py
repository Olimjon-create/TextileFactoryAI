"""Resurslar: ishlab chiqarish liniyalari, smenalar, xodimlar va mashinalar.

ProductionStage — kesish/tikuv/pardoz/sifat/qadoqlash bosqichlari ro'yxati: liniyalar shu yerda,
keyingi bosqichdagi ish buyurtmalari ham aynan shu enumni ishlatadi (ikki joyda yozilmaydi).
Mashina holati tarixi (MachineStatusLog) — downtime va availability shu jurnaldan hisoblanadi.
"""

import enum
from datetime import date, datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class ProductionStage(str, enum.Enum):
    CUTTING = "CUTTING"  # bichish / kesish
    SEWING = "SEWING"  # tikuv
    FINISHING = "FINISHING"  # pardoz: dazmollash, ip qirqish, tugma
    QUALITY_CONTROL = "QUALITY_CONTROL"
    PACKING = "PACKING"


class Department(str, enum.Enum):
    CUTTING = "CUTTING"
    SEWING = "SEWING"
    FINISHING = "FINISHING"
    QUALITY_CONTROL = "QUALITY_CONTROL"
    PACKING = "PACKING"
    WAREHOUSE = "WAREHOUSE"
    MAINTENANCE = "MAINTENANCE"  # mexaniklar
    ADMINISTRATION = "ADMINISTRATION"
    OTHER = "OTHER"


class PayType(str, enum.Enum):
    MONTHLY = "MONTHLY"  # oylik maosh
    HOURLY = "HOURLY"  # soatbay
    PIECE = "PIECE"  # ishbay (donabay)


class EmployeeStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ON_LEAVE = "ON_LEAVE"
    TERMINATED = "TERMINATED"


class MachineType(str, enum.Enum):
    CUTTING = "CUTTING"  # bichish mashinasi
    SPREADING = "SPREADING"  # mato yoyish
    LOCKSTITCH = "LOCKSTITCH"  # to'g'ri chok (universal)
    OVERLOCK = "OVERLOCK"
    COVERSTITCH = "COVERSTITCH"  # rasposhivalka
    BUTTONHOLE = "BUTTONHOLE"  # ilgak (petlya)
    BUTTON_ATTACH = "BUTTON_ATTACH"  # tugma qadash
    BARTACK = "BARTACK"  # zakrepka
    EMBROIDERY = "EMBROIDERY"  # kashta
    PRINTING = "PRINTING"  # bosma
    PRESS = "PRESS"  # dazmol / press
    KNITTING = "KNITTING"  # to'quv
    OTHER = "OTHER"


class MachineStatus(str, enum.Enum):
    WORKING = "WORKING"
    IDLE = "IDLE"
    BROKEN = "BROKEN"
    MAINTENANCE = "MAINTENANCE"


class MaintenanceKind(str, enum.Enum):
    PREVENTIVE = "PREVENTIVE"  # rejali texnik xizmat
    REPAIR = "REPAIR"  # ta'mirlash (buzilishdan keyin)


class ProductionLine(Base, TimestampMixin):
    """Ishlab chiqarish liniyasi / bo'limi (masalan "Tikuv-1", "Kesish sexi")."""

    __tablename__ = "production_lines"
    __table_args__ = (UniqueConstraint("factory_id", "code", name="uq_production_lines_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(100))
    stage: Mapped[ProductionStage] = mapped_column(Enum(ProductionStage, name="production_stage"))
    # Bir smenada chiqarish quvvati (dona) — rejalashtirish uchun
    capacity_per_shift: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class Shift(Base, TimestampMixin):
    """Smena. end_time < start_time bo'lsa — tungi smena (yarim tundan o'tadi)."""

    __tablename__ = "shifts"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time] = mapped_column(Time)
    break_minutes: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())


class Employee(Base, TimestampMixin):
    """Zavod xodimi (tizimga kirish shart emas; kerak bo'lsa user_id orqali akkauntga bog'lanadi)."""

    __tablename__ = "employees"
    __table_args__ = (UniqueConstraint("factory_id", "employee_code", name="uq_employees_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    employee_code: Mapped[str] = mapped_column(String(30), index=True)
    full_name: Mapped[str] = mapped_column(String(200), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    position: Mapped[str | None] = mapped_column(String(100))  # lavozim: tikuvchi, bichuvchi, mexanik...
    department: Mapped[Department] = mapped_column(Enum(Department, name="department"), index=True)
    line_id: Mapped[int | None] = mapped_column(ForeignKey("production_lines.id", ondelete="SET NULL"), index=True)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("shifts.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), unique=True)
    hire_date: Mapped[date | None] = mapped_column(Date)
    pay_type: Mapped[PayType] = mapped_column(Enum(PayType, name="pay_type"), default=PayType.MONTHLY)
    # Maxfiy: oylik (so'm/oy), soatbay (so'm/soat) yoki ishbay (so'm/dona) — tannarx hisobida ishlatiladi
    pay_rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    # Smenadagi me'yor (dona) — KPI (samaradorlik) shu bilan solishtiriladi
    daily_norm: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[EmployeeStatus] = mapped_column(
        Enum(EmployeeStatus, name="employee_status"), default=EmployeeStatus.ACTIVE, index=True
    )
    notes: Mapped[str | None] = mapped_column(String(500))

    line: Mapped[ProductionLine | None] = relationship()
    shift: Mapped[Shift | None] = relationship()
    user: Mapped["User | None"] = relationship()


class Machine(Base, TimestampMixin):
    __tablename__ = "machines"
    __table_args__ = (UniqueConstraint("factory_id", "code", name="uq_machines_factory_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(30), index=True)  # inventar raqami (QR/shtrix-kod shunga bosiladi)
    name: Mapped[str] = mapped_column(String(150))
    machine_type: Mapped[MachineType] = mapped_column(Enum(MachineType, name="machine_type"), index=True)
    brand: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    serial_number: Mapped[str | None] = mapped_column(String(100))
    line_id: Mapped[int | None] = mapped_column(ForeignKey("production_lines.id", ondelete="SET NULL"), index=True)
    status: Mapped[MachineStatus] = mapped_column(
        Enum(MachineStatus, name="machine_status"), default=MachineStatus.IDLE, index=True
    )
    status_since: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    purchase_date: Mapped[date | None] = mapped_column(Date)
    # Rejali texnik xizmat har necha kunda (bo'sh — rejalashtirilmagan)
    maintenance_interval_days: Mapped[int | None] = mapped_column(Integer)
    last_maintenance_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())

    line: Mapped[ProductionLine | None] = relationship()


class MachineStatusLog(Base):
    """Mashina holati davrlari: har bir o'zgarishda oldingi davr yopiladi (ended_at), yangisi ochiladi."""

    __tablename__ = "machine_status_logs"
    __table_args__ = (Index("ix_machine_status_logs_machine_started", "machine_id", "started_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id", ondelete="CASCADE"))
    status: Mapped[MachineStatus] = mapped_column(Enum(MachineStatus, name="machine_status"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str | None] = mapped_column(String(300))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    created_by: Mapped["User | None"] = relationship()


class MachineMaintenance(Base):
    """Texnik xizmat va ta'mirlash tarixi."""

    __tablename__ = "machine_maintenance"

    id: Mapped[int] = mapped_column(primary_key=True)
    factory_id: Mapped[int] = mapped_column(ForeignKey("factories.id", ondelete="CASCADE"), index=True)
    machine_id: Mapped[int] = mapped_column(ForeignKey("machines.id", ondelete="CASCADE"), index=True)
    kind: Mapped[MaintenanceKind] = mapped_column(Enum(MaintenanceKind, name="maintenance_kind"))
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    description: Mapped[str] = mapped_column(Text)
    parts_used: Mapped[str | None] = mapped_column(String(500))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    # Kim bajardi: zavod xodimi (mexanik) yoki tashqi usta nomi
    technician_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"))
    technician_name: Mapped[str | None] = mapped_column(String(200))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    technician: Mapped[Employee | None] = relationship()
