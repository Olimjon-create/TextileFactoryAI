"""AI / Computer Vision: qurilmalar, hodisalar (qurilma API'si), qoidalar."""

import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.resources import MachineStatus, ProductionStage
from app.models.vision import DeviceKind, EventStatus, EventType, RuleAction
from app.schemas.common import clean_str, media_url
from app.schemas.inventory import _code

MAX_BATCH = 100
MAX_PAYLOAD_BYTES = 4000


class Ref(BaseModel):
    id: int
    code: str | None = None
    name: str


# ---------- qurilmalar ----------


class DeviceCreate(BaseModel):
    code: str
    name: str = Field(min_length=2, max_length=120)
    kind: DeviceKind
    stage: ProductionStage | None = None
    line_id: int | None = None
    machine_id: int | None = None
    notes: str | None = Field(default=None, max_length=2000)
    factory_id: int | None = None

    @field_validator("code")
    @classmethod
    def _code(cls, v: str) -> str:
        return _code(v, 30)

    @field_validator("name", "notes")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class DeviceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    kind: DeviceKind | None = None
    stage: ProductionStage | None = None
    line_id: int | None = None
    machine_id: int | None = None
    work_order_id: int | None = None  # hozir kuzatilayotgan ish buyurtmasi
    is_active: bool | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("name", "notes")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)


class DeviceOut(BaseModel):
    id: int
    factory_id: int
    code: str
    name: str
    kind: DeviceKind
    stage: ProductionStage | None
    line: Ref | None
    machine: Ref | None
    work_order: Ref | None
    key_prefix: str
    is_active: bool
    online: bool  # oxirgi aloqa yaqinda bo'lganmi
    last_seen_at: datetime | None
    last_ip: str | None
    notes: str | None
    events_today: int = 0
    pending: int = 0


class DeviceWithKey(DeviceOut):
    """Kalit faqat yaratilganda yoki almashtirilganda bir marta ko'rsatiladi."""

    api_key: str


# ---------- hodisalar (qurilma API) ----------


class EventIn(BaseModel):
    event_type: EventType
    external_id: str | None = Field(default=None, max_length=64)
    occurred_at: datetime | None = None  # bo'sh — qabul qilingan vaqt; vaqt zonasi bilan yuboring
    stage: ProductionStage | None = None  # bo'sh — qurilmaning bosqichi
    quantity: int | None = Field(default=None, ge=0, le=100_000)
    defect_reason: str | None = Field(default=None, max_length=300)
    machine_state: MachineStatus | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    work_order: str | None = Field(default=None, max_length=20)  # WO raqami (WO-000012) — bo'sh bo'lsa qurilmaga biriktirilgan
    unit_code: str | None = Field(default=None, max_length=40)  # partiya/quti QR kodi
    employee_code: str | None = Field(default=None, max_length=30)  # xodim kodi (bejik/yuz tanish)
    image_url: str | None = Field(default=None, max_length=500)
    data: dict[str, Any] | None = None  # modelning qo'shimcha natijalari (bbox, klasslar...)

    @field_validator("external_id", "defect_reason", "work_order", "unit_code", "employee_code")
    @classmethod
    def _clean(cls, v):
        return clean_str(v)

    @field_validator("image_url")
    @classmethod
    def _url(cls, v):
        return media_url(v)

    @field_validator("data")
    @classmethod
    def _small(cls, v):
        if v is not None and len(json.dumps(v, default=str)) > MAX_PAYLOAD_BYTES:
            raise ValueError(f"data {MAX_PAYLOAD_BYTES} baytdan oshmasin")
        return v


class IngestRequest(BaseModel):
    events: list[EventIn] = Field(default_factory=list, max_length=MAX_BATCH)  # bo'sh — faqat "tirikman" (heartbeat)


class IngestResult(BaseModel):
    external_id: str | None
    event_id: int
    status: EventStatus
    message: str | None
    duplicate: bool = False


class IngestResponse(BaseModel):
    device: str
    accepted: int
    results: list[IngestResult]


class EventOut(BaseModel):
    id: int
    device: Ref
    external_id: str | None
    event_type: EventType
    occurred_at: datetime
    received_at: datetime
    stage: ProductionStage | None
    quantity: int | None
    defect_reason: str | None
    machine_state: MachineStatus | None
    confidence: float | None
    work_order: Ref | None
    unit_code: str | None
    employee_code: str | None
    image_url: str | None
    payload: dict[str, Any] | None
    status: EventStatus
    status_message: str | None
    production_log_id: int | None
    reviewed_by_name: str | None
    reviewed_at: datetime | None


class EventPage(BaseModel):
    items: list[EventOut]
    total: int


class ApplyRequest(BaseModel):
    """Tasdiqlashda aniqlashtirish (kamera ish buyurtmasini aniqlay olmagan bo'lsa)."""

    work_order_id: int | None = None
    stage: ProductionStage | None = None
    quantity: int | None = Field(default=None, ge=1, le=100_000)


class RejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=300)


# ---------- qoidalar ----------


class RuleIn(BaseModel):
    event_type: EventType
    device_id: int | None = None  # bo'sh — fabrikaning barcha qurilmalari uchun
    action: RuleAction
    min_confidence: float = Field(default=0.8, ge=0, le=1)
    alert_threshold: int | None = Field(default=None, ge=1, le=1_000_000)
    alert_window_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    is_active: bool = True
    notes: str | None = Field(default=None, max_length=300)
    factory_id: int | None = None


class RuleUpdate(BaseModel):
    action: RuleAction | None = None
    min_confidence: float | None = Field(default=None, ge=0, le=1)
    alert_threshold: int | None = Field(default=None, ge=1, le=1_000_000)
    alert_window_minutes: int | None = Field(default=None, ge=1, le=24 * 60)
    is_active: bool | None = None
    notes: str | None = Field(default=None, max_length=300)


class RuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    event_type: EventType
    device: Ref | None = None
    action: RuleAction
    min_confidence: float
    alert_threshold: int | None
    alert_window_minutes: int | None
    is_active: bool
    notes: str | None


class VisionSummary(BaseModel):
    devices: int
    online: int
    events_today: int
    pending: int
    applied_today: int
    rejected_today: int
    counted_today: int  # kamera sanagan dona (qo'llangan)
    defects_today: int
