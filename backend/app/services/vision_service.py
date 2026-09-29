"""AI / Computer Vision integratsiyasi: qurilmalar, hodisalarni qabul qilish va qayta ishlash, qoidalar.

Oqim:
  1) qurilma (kamera, AI-quti, sensor) kalit bilan POST /vision/ingest ga hodisalarni yuboradi;
  2) hodisa har doim saqlanadi (xom kuzatuv, keyingi tahlil va modelni o'qitish uchun);
  3) qoida (bazada, fabrika sozlaydi) hal qiladi: avtomatik qo'llash / odam tasdiqlashi / faqat saqlash;
  4) qo'llash faqat mavjud yo'llar orqali: sanoq va brak → production_service.add_log (source=CAMERA —
     bosqich chegaralari, buyurtma holati, KPI, tannarx o'zi ishlaydi); mashina holati → machine_service.
  Qo'llab bo'lmasa (ish buyurtmasi aniqlanmagan, chegaradan oshgan) — hodisa tasdiqlash navbatiga tushadi.
"""

import hashlib
import secrets
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.core.scope import can_access, resolve_factory_id, scoped
from app.models import Device, DeviceEvent, Employee, Machine, ProductionLine, TrackingUnit, User, VisionRule, WorkOrder
from app.models.audit import AuditAction
from app.models.production import LogSource
from app.models.resources import MachineStatus
from app.models.vision import EventStatus, EventType, RuleAction
from app.schemas.production import LogCreate
from app.schemas.vision import (
    ApplyRequest,
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    DeviceWithKey,
    EventIn,
    EventOut,
    EventPage,
    IngestRequest,
    IngestResponse,
    IngestResult,
    Ref,
    RejectRequest,
    RuleIn,
    RuleOut,
    RuleUpdate,
    VisionSummary,
)
from app.services import audit_service, machine_service, production_service
from app.core.i18n import t

VISION_VIEW_ROLES = production_service.PRODUCTION_VIEW_ROLES
VISION_EDITOR_ROLES = production_service.PRODUCTION_EDITOR_ROLES

KEY_PREFIX = "tfd_"
ONLINE_SECONDS = 300
DEFAULT_RULE = (RuleAction.REVIEW, Decimal("0.8"))
STAGE_NAMES = production_service.STAGE_NAMES


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _naive(dt: datetime | None) -> datetime | None:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt and dt.tzinfo else dt


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _new_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def device_actor(device: Device) -> User:
    """Qurilma nomidan bajariladigan amallar uchun vaqtinchalik (bazaga yozilmaydigan) ijrochi.
    Audit jurnalida "Qurilma CAM-01" bo'lib ko'rinadi, created_by — bo'sh."""
    return User(id=None, email=f"device-{device.id}@local", full_name=f"Qurilma {device.code}",
                role=Role.PRODUCTION_MANAGER, factory_id=device.factory_id, is_active=True)


def _get_device(db: Session, actor: User, device_id: int) -> Device:
    d = db.scalar(select(Device).options(selectinload(Device.line), selectinload(Device.machine), selectinload(Device.work_order)).where(Device.id == device_id))
    if d is None or not can_access(actor, d.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Qurilma topilmadi")
    return d


def _online(d: Device) -> bool:
    return d.last_seen_at is not None and _naive(d.last_seen_at) >= _naive(_now()) - timedelta(seconds=ONLINE_SECONDS)


def _counts(db: Session, device_ids: list[int]) -> dict[int, tuple[int, int]]:
    if not device_ids:
        return {}
    today = datetime.combine(date.today(), time.min)
    rows = db.execute(
        select(DeviceEvent.device_id,
               func.sum(case((DeviceEvent.received_at >= today, 1), else_=0)),
               func.sum(case((DeviceEvent.status == EventStatus.PENDING, 1), else_=0)))
        .where(DeviceEvent.device_id.in_(device_ids)).group_by(DeviceEvent.device_id)
    )
    return {did: (int(a or 0), int(b or 0)) for did, a, b in rows}


def _device_out(d: Device, counts: dict[int, tuple[int, int]]) -> DeviceOut:
    today, pending = counts.get(d.id, (0, 0))
    return DeviceOut(
        id=d.id, factory_id=d.factory_id, code=d.code, name=d.name, kind=d.kind, stage=d.stage,
        line=Ref(id=d.line.id, code=d.line.code, name=d.line.name) if d.line else None,
        machine=Ref(id=d.machine.id, code=d.machine.code, name=d.machine.name) if d.machine else None,
        work_order=Ref(id=d.work_order.id, code=d.work_order.number, name=d.work_order.product_name) if d.work_order else None,
        key_prefix=d.key_prefix, is_active=d.is_active, online=_online(d), last_seen_at=d.last_seen_at, last_ip=d.last_ip,
        notes=d.notes, events_today=today, pending=pending,
    )


def list_devices(db: Session, actor: User, factory_id: int | None = None) -> list[DeviceOut]:
    rows = list(db.scalars(scoped(
        select(Device).options(selectinload(Device.line), selectinload(Device.machine), selectinload(Device.work_order)),
        actor, Device.factory_id, factory_id,
    ).order_by(Device.code)))
    counts = _counts(db, [d.id for d in rows])
    return [_device_out(d, counts) for d in rows]


def get_device(db: Session, actor: User, device_id: int) -> DeviceOut:
    d = _get_device(db, actor, device_id)
    return _device_out(d, _counts(db, [d.id]))


def _check_refs(db: Session, factory_id: int, line_id: int | None, machine_id: int | None, work_order_id: int | None = None) -> None:
    for model, ref_id, label in ((ProductionLine, line_id, "Liniya"), (Machine, machine_id, "Mashina"), (WorkOrder, work_order_id, "Ish buyurtmasi")):
        if ref_id is not None:
            obj = db.get(model, ref_id)
            if obj is None or obj.factory_id != factory_id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("{label} topilmadi", label=label))
    if work_order_id is not None and db.get(WorkOrder, work_order_id).status not in production_service.OPEN:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Yopilgan ish buyurtmasini kuzatib bo'lmaydi")


def create_device(db: Session, actor: User, data: DeviceCreate) -> DeviceWithKey:
    fid = resolve_factory_id(db, actor, data.factory_id)
    if db.scalar(select(Device.id).where(Device.factory_id == fid, Device.code == data.code)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, t("'{code}' kodli qurilma allaqachon mavjud", code=data.code))
    _check_refs(db, fid, data.line_id, data.machine_id)
    key = _new_key()
    d = Device(factory_id=fid, **data.model_dump(exclude={"factory_id"}), key_hash=_hash(key), key_prefix=key[:12])
    db.add(d)
    db.flush()
    audit_service.record(db, actor, entity="device", entity_id=d.id, action=AuditAction.CREATE,
                         summary=f"Qurilma qo'shildi: {d.code} — {d.name}", factory_id=fid)
    db.commit()
    return DeviceWithKey(**get_device(db, actor, d.id).model_dump(), api_key=key)


def update_device(db: Session, actor: User, device_id: int, data: DeviceUpdate) -> DeviceOut:
    d = _get_device(db, actor, device_id)
    values = data.model_dump(exclude_unset=True)
    for key in ("name", "kind", "is_active"):
        if values.get(key, 0) is None:
            values.pop(key)
    _check_refs(db, d.factory_id, values.get("line_id"), values.get("machine_id"), values.get("work_order_id"))
    changes = audit_service.diff(d, values)
    for field, value in values.items():
        setattr(d, field, value)
    if changes:
        audit_service.record(db, actor, entity="device", entity_id=d.id, action=AuditAction.UPDATE,
                             summary=f"Qurilma o'zgartirildi: {d.code}", factory_id=d.factory_id, changes=changes)
    db.commit()
    db.expire(d)
    return get_device(db, actor, d.id)


def rotate_key(db: Session, actor: User, device_id: int) -> DeviceWithKey:
    d = _get_device(db, actor, device_id)
    key = _new_key()
    d.key_hash, d.key_prefix = _hash(key), key[:12]
    audit_service.record(db, actor, entity="device", entity_id=d.id, action=AuditAction.UPDATE,
                         summary=f"Qurilma kaliti almashtirildi: {d.code} (eski kalit endi ishlamaydi)", factory_id=d.factory_id)
    db.commit()
    return DeviceWithKey(**get_device(db, actor, d.id).model_dump(), api_key=key)


def delete_device(db: Session, actor: User, device_id: int) -> None:
    d = _get_device(db, actor, device_id)
    if db.scalar(select(DeviceEvent.id).where(DeviceEvent.device_id == d.id).limit(1)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Qurilmaning hodisalar tarixi bor — o'chirish o'rniga nofaol qiling")
    audit_service.record(db, actor, entity="device", entity_id=d.id, action=AuditAction.DELETE,
                         summary=f"Qurilma o'chirildi: {d.code}", factory_id=d.factory_id)
    db.delete(d)
    db.commit()


def authenticate(db: Session, key: str | None) -> Device:
    if not key or not key.startswith(KEY_PREFIX):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Qurilma kaliti noto'g'ri")
    d = db.scalar(select(Device).where(Device.key_hash == _hash(key)))
    if d is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Qurilma kaliti noto'g'ri")
    if not d.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Qurilma nofaol")
    return d


def _rule_for(db: Session, device: Device, event_type: EventType) -> tuple[RuleAction, Decimal]:
    rules = db.scalars(select(VisionRule).where(
        VisionRule.factory_id == device.factory_id, VisionRule.event_type == event_type, VisionRule.is_active.is_(True),
        or_(VisionRule.device_id == device.id, VisionRule.device_id.is_(None)),
    ))
    best = sorted(rules, key=lambda r: r.device_id is None)
    return (best[0].action, Decimal(best[0].min_confidence)) if best else DEFAULT_RULE


def _rule_out(r: VisionRule) -> RuleOut:
    out = RuleOut.model_validate(r)
    out.device = Ref(id=r.device.id, code=r.device.code, name=r.device.name) if r.device else None
    return out


def list_rules(db: Session, actor: User, factory_id: int | None = None) -> list[RuleOut]:
    rows = db.scalars(scoped(select(VisionRule).options(selectinload(VisionRule.device)), actor, VisionRule.factory_id, factory_id)
                      .order_by(VisionRule.event_type, VisionRule.device_id))
    return [_rule_out(r) for r in rows]


def _get_rule(db: Session, actor: User, rule_id: int) -> VisionRule:
    r = db.get(VisionRule, rule_id)
    if r is None or not can_access(actor, r.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Qoida topilmadi")
    return r


def _check_alert(threshold: int | None, window: int | None) -> None:
    if (threshold is None) != (window is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ogohlantirish uchun chegara va vaqt oralig'ini birga kiriting")


def create_rule(db: Session, actor: User, data: RuleIn) -> RuleOut:
    fid = resolve_factory_id(db, actor, data.factory_id)
    if data.device_id is not None:
        dev = db.get(Device, data.device_id)
        if dev is None or dev.factory_id != fid:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Qurilma topilmadi")
    _check_alert(data.alert_threshold, data.alert_window_minutes)
    exists = select(VisionRule.id).where(VisionRule.factory_id == fid, VisionRule.event_type == data.event_type,
                                         VisionRule.device_id.is_(None) if data.device_id is None else VisionRule.device_id == data.device_id)
    if db.scalar(exists) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu hodisa turi va qurilma uchun qoida allaqachon bor — uni tahrirlang")
    r = VisionRule(factory_id=fid, **data.model_dump(exclude={"factory_id", "min_confidence"}), min_confidence=Decimal(str(data.min_confidence)))
    db.add(r)
    db.flush()
    audit_service.record(db, actor, entity="vision_rule", entity_id=r.id, action=AuditAction.CREATE,
                         summary=f"AI qoidasi: {r.event_type.value} → {r.action.value}", factory_id=fid)
    db.commit()
    db.expire(r)
    return _rule_out(r)


def update_rule(db: Session, actor: User, rule_id: int, data: RuleUpdate) -> RuleOut:
    r = _get_rule(db, actor, rule_id)
    values = data.model_dump(exclude_unset=True)
    for key in ("action", "min_confidence", "is_active"):
        if values.get(key, 0) is None:
            values.pop(key)
    if "min_confidence" in values:
        values["min_confidence"] = Decimal(str(values["min_confidence"]))
    _check_alert(values.get("alert_threshold", r.alert_threshold), values.get("alert_window_minutes", r.alert_window_minutes))
    changes = audit_service.diff(r, values)
    for field, value in values.items():
        setattr(r, field, value)
    if changes:
        audit_service.record(db, actor, entity="vision_rule", entity_id=r.id, action=AuditAction.UPDATE,
                             summary=f"AI qoidasi o'zgartirildi: {r.event_type.value}", factory_id=r.factory_id, changes=changes)
    db.commit()
    db.expire(r)
    return _rule_out(r)


def delete_rule(db: Session, actor: User, rule_id: int) -> None:
    r = _get_rule(db, actor, rule_id)
    audit_service.record(db, actor, entity="vision_rule", entity_id=r.id, action=AuditAction.DELETE,
                         summary=f"AI qoidasi o'chirildi: {r.event_type.value}", factory_id=r.factory_id)
    db.delete(r)
    db.commit()


class _NotReady(Exception):
    """Hodisani hozir qo'llab bo'lmaydi — odam aniqlashtirishi kerak (PENDING)."""


def _resolve_wo(db: Session, event: DeviceEvent, device: Device, wo_number: str | None) -> WorkOrder:
    wo = None
    if event.work_order_id:
        wo = db.get(WorkOrder, event.work_order_id)
    elif wo_number:
        wo = db.scalar(select(WorkOrder).where(WorkOrder.factory_id == device.factory_id, WorkOrder.number == wo_number.upper()))
        if wo is None:
            raise _NotReady(f"«{wo_number}» ish buyurtmasi topilmadi")
    elif event.unit_code:
        unit = db.scalar(select(TrackingUnit).where(TrackingUnit.factory_id == device.factory_id, TrackingUnit.code == event.unit_code.upper()))
        wo = db.get(WorkOrder, unit.work_order_id) if unit else None
        if wo is None:
            raise _NotReady(f"«{event.unit_code}» partiya/quti topilmadi")
    elif device.work_order_id:
        wo = db.get(WorkOrder, device.work_order_id)
    if wo is None or wo.factory_id != device.factory_id:
        raise _NotReady("Ish buyurtmasi aniqlanmadi — qurilmaga ish buyurtmasini biriktiring yoki tasdiqlashda tanlang")
    return wo


def _apply(db: Session, actor: User, event: DeviceEvent, device: Device, wo_number: str | None = None) -> str:
    """Hodisani tizimga qo'llaydi (commit bilan). Muvaffaqiyatda xabar qaytaradi.
    _NotReady — aniqlashtirish kerak; HTTPException — mavjud tekshiruvlar rad etdi."""
    if event.event_type == EventType.MACHINE_STATE:
        machine = db.get(Machine, device.machine_id) if device.machine_id else None
        if machine is None:
            raise _NotReady("Qurilmaga mashina biriktirilmagan")
        if event.machine_state is None:
            raise _NotReady("Mashina holati ko'rsatilmagan")
        if not machine.is_active:
            raise HTTPException(status.HTTP_409_CONFLICT, "Mashina nofaol")
        if machine.status == event.machine_state:
            return "Holat o'zgarmagan"
        reason = event.defect_reason or (f"{device.code} aniqladi" if event.machine_state == MachineStatus.BROKEN else None)
        machine_service._apply_status(db, actor, machine, event.machine_state, reason, event.occurred_at)
        db.commit()
        return f"{machine.code}: {event.machine_state.value}"

    stage = event.stage or device.stage
    if stage is None:
        raise _NotReady("Bosqich aniqlanmadi — qurilmaga bosqich belgilang")
    qty = event.quantity if event.quantity is not None else 1
    if qty < 1:
        raise _NotReady("Miqdor 0")
    wo = _resolve_wo(db, event, device, wo_number)
    employee_id = None
    if event.employee_code:
        employee_id = db.scalar(select(Employee.id).where(Employee.factory_id == device.factory_id, Employee.employee_code == event.employee_code.upper()))
    defect = event.event_type == EventType.DEFECT
    note = f"{device.code}" + (f" · ishonch {float(event.confidence):.2f}" if event.confidence is not None else "")
    local_day = event.occurred_at.date()
    detail = production_service.add_log(db, actor, wo.id, LogCreate(
        stage=stage, quantity_good=0 if defect else qty, quantity_defect=qty if defect else 0,
        defect_reason=(event.defect_reason or "Kamera aniqlagan brak") if defect else None,
        work_date=min(local_day, date.today()), employee_id=employee_id, machine_id=device.machine_id,
        line_id=device.line_id, unit_code=event.unit_code, source=LogSource.CAMERA, note=note,
    ))
    event.work_order_id = wo.id
    event.production_log_id = max((log.id for log in detail.logs), default=None)
    return f"{wo.number}: {STAGE_NAMES[stage]} {'brak' if defect else '+'}{qty}"


def _process(db: Session, event: DeviceEvent, device: Device, wo_number: str | None) -> None:
    if event.event_type == EventType.CUSTOM:
        event.status, event.status_message = EventStatus.STORED, "Tahlil uchun saqlandi"
        db.commit()
        return
    action, min_conf = _rule_for(db, device, event.event_type)
    if action == RuleAction.STORE_ONLY:
        event.status, event.status_message = EventStatus.STORED, "Qoida: faqat saqlash"
    elif action == RuleAction.REVIEW:
        event.status, event.status_message = EventStatus.PENDING, "Qoida: tasdiqlash kerak"
    elif event.confidence is not None and Decimal(event.confidence) < min_conf:
        event.status, event.status_message = EventStatus.PENDING, f"Ishonch past ({float(event.confidence):.2f} < {float(min_conf):.2f})"
    else:
        event_id = event.id
        try:
            message = _apply(db, device_actor(device), event, device, wo_number)
            event.status, event.status_message = EventStatus.APPLIED, message
        except _NotReady as exc:
            db.rollback()
            event = db.get(DeviceEvent, event_id)
            event.status, event.status_message = EventStatus.PENDING, str(exc)[:300]
        except HTTPException as exc:
            db.rollback()
            event = db.get(DeviceEvent, event_id)
            event.status, event.status_message = EventStatus.PENDING, f"Qo'llanmadi: {exc.detail}"[:300]
    db.commit()


def ingest(db: Session, device: Device, data: IngestRequest, ip: str | None) -> IngestResponse:
    device.last_seen_at, device.last_ip = _now(), ip
    db.commit()
    results = []
    for item in data.events:
        if item.external_id:
            existing = db.scalar(select(DeviceEvent).where(DeviceEvent.device_id == device.id, DeviceEvent.external_id == item.external_id))
            if existing is not None:
                results.append(IngestResult(external_id=item.external_id, event_id=existing.id, status=existing.status,
                                            message=existing.status_message, duplicate=True))
                continue
        event = _new_event(device, item)
        db.add(event)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(DeviceEvent).where(DeviceEvent.device_id == device.id, DeviceEvent.external_id == item.external_id))
            results.append(IngestResult(external_id=item.external_id, event_id=existing.id, status=existing.status,
                                        message=existing.status_message, duplicate=True))
            continue
        _process(db, event, device, item.work_order)
        db.refresh(event)
        results.append(IngestResult(external_id=item.external_id, event_id=event.id, status=event.status, message=event.status_message))
    return IngestResponse(device=device.code, accepted=len(results), results=results)


def _new_event(device: Device, item: EventIn) -> DeviceEvent:
    occurred = item.occurred_at or _now()
    if occurred.tzinfo is None:
        occurred = occurred.replace(tzinfo=timezone.utc)
    if occurred > _now() + timedelta(minutes=5):
        occurred = _now()
    payload = dict(item.data or {})
    if item.work_order:
        payload["work_order"] = item.work_order
    return DeviceEvent(
        factory_id=device.factory_id, device_id=device.id, external_id=item.external_id, event_type=item.event_type,
        occurred_at=occurred, stage=item.stage, quantity=item.quantity, defect_reason=item.defect_reason,
        machine_state=item.machine_state, confidence=Decimal(str(item.confidence)).quantize(Decimal("0.001")) if item.confidence is not None else None,
        unit_code=item.unit_code, employee_code=item.employee_code, image_url=item.image_url, payload=payload or None,
        status=EventStatus.PENDING, status_message="Qabul qilindi",
    )


def _event_out(e: DeviceEvent, wo: WorkOrder | None, reviewer: str | None) -> EventOut:
    return EventOut(
        id=e.id, device=Ref(id=e.device.id, code=e.device.code, name=e.device.name), external_id=e.external_id,
        event_type=e.event_type, occurred_at=e.occurred_at, received_at=e.received_at, stage=e.stage, quantity=e.quantity,
        defect_reason=e.defect_reason, machine_state=e.machine_state, confidence=float(e.confidence) if e.confidence is not None else None,
        work_order=Ref(id=wo.id, code=wo.number, name=wo.product_name) if wo else None, unit_code=e.unit_code,
        employee_code=e.employee_code, image_url=e.image_url, payload=e.payload, status=e.status, status_message=e.status_message,
        production_log_id=e.production_log_id, reviewed_by_name=reviewer, reviewed_at=e.reviewed_at,
    )


def list_events(
    db: Session, actor: User, *, status_: EventStatus | None = None, device_id: int | None = None, event_type: EventType | None = None,
    date_from: date | None = None, date_to: date | None = None, factory_id: int | None = None, offset: int = 0, limit: int = 50,
) -> EventPage:
    query = scoped(select(DeviceEvent, WorkOrder, User.full_name)
                   .outerjoin(WorkOrder, WorkOrder.id == DeviceEvent.work_order_id)
                   .outerjoin(User, User.id == DeviceEvent.reviewed_by_id)
                   .options(selectinload(DeviceEvent.device)), actor, DeviceEvent.factory_id, factory_id)
    for column, value in ((DeviceEvent.status, status_), (DeviceEvent.device_id, device_id), (DeviceEvent.event_type, event_type)):
        if value is not None:
            query = query.where(column == value)
    if date_from:
        query = query.where(DeviceEvent.occurred_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.where(DeviceEvent.occurred_at < datetime.combine(date_to + timedelta(days=1), time.min))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.execute(query.order_by(DeviceEvent.occurred_at.desc(), DeviceEvent.id.desc()).offset(offset).limit(limit)).all()
    return EventPage(items=[_event_out(e, wo, name) for e, wo, name in rows], total=total)


def _get_event(db: Session, actor: User, event_id: int) -> DeviceEvent:
    e = db.scalar(select(DeviceEvent).options(selectinload(DeviceEvent.device)).where(DeviceEvent.id == event_id))
    if e is None or not can_access(actor, e.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hodisa topilmadi")
    return e


def _one(db: Session, event_id: int) -> EventOut:
    e = db.scalar(select(DeviceEvent).options(selectinload(DeviceEvent.device)).where(DeviceEvent.id == event_id))
    wo = db.get(WorkOrder, e.work_order_id) if e.work_order_id else None
    reviewer = db.get(User, e.reviewed_by_id).full_name if e.reviewed_by_id and db.get(User, e.reviewed_by_id) else None
    return _event_out(e, wo, reviewer)


def apply_event(db: Session, actor: User, event_id: int, data: ApplyRequest) -> EventOut:
    """Odam tasdiqlaydi (kerak bo'lsa ish buyurtmasi/bosqich/miqdorni aniqlashtirib). Mavjud tekshiruvlar xatosi — foydalanuvchiga."""
    e = _get_event(db, actor, event_id)
    if e.status not in (EventStatus.PENDING, EventStatus.REJECTED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu hodisa allaqachon qayta ishlangan")
    if e.event_type == EventType.CUSTOM:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bu turdagi hodisa tizimga qo'llanmaydi")
    if data.work_order_id is not None:
        wo = db.get(WorkOrder, data.work_order_id)
        if wo is None or wo.factory_id != e.factory_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Ish buyurtmasi topilmadi")
        e.work_order_id = wo.id
    if data.stage is not None:
        e.stage = data.stage
    if data.quantity is not None:
        e.quantity = data.quantity
    device = db.get(Device, e.device_id)
    wo_number = (e.payload or {}).get("work_order")
    try:
        message = _apply(db, actor, e, device, wo_number)
    except _NotReady as exc:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc))
    except HTTPException:
        db.rollback()
        raise
    e = db.get(DeviceEvent, event_id)
    e.status, e.status_message = EventStatus.APPLIED, f"{message} · tasdiqladi: {actor.full_name}"[:300]
    e.reviewed_by_id, e.reviewed_at = actor.id, _now()
    db.commit()
    return _one(db, e.id)


def reject_event(db: Session, actor: User, event_id: int, data: RejectRequest) -> EventOut:
    e = _get_event(db, actor, event_id)
    if e.status != EventStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Faqat tasdiqlash kutilayotgan hodisa rad etiladi")
    e.status = EventStatus.REJECTED
    e.status_message = f"Rad etildi: {data.reason}"[:300] if data.reason else "Rad etildi"
    e.reviewed_by_id, e.reviewed_at = actor.id, _now()
    audit_service.record(db, actor, entity="device_event", entity_id=e.id, action=AuditAction.STATUS,
                         summary=f"AI hodisasi rad etildi: {e.device.code} {e.event_type.value}", factory_id=e.factory_id)
    db.commit()
    return _one(db, e.id)


def summary(db: Session, actor: User, factory_id: int | None = None) -> VisionSummary:
    devices = list(db.scalars(scoped(select(Device).where(Device.is_active.is_(True)), actor, Device.factory_id, factory_id)))
    today = datetime.combine(date.today(), time.min)
    ev = scoped(select(DeviceEvent), actor, DeviceEvent.factory_id, factory_id).subquery()

    def count(*conds) -> int:
        return int(db.scalar(select(func.count()).select_from(ev).where(*conds)) or 0)

    def qty(kind: EventType) -> int:
        return int(db.scalar(select(func.coalesce(func.sum(func.coalesce(ev.c.quantity, 1)), 0)).select_from(ev).where(
            ev.c.event_type == kind.value, ev.c.status == EventStatus.APPLIED.value, ev.c.received_at >= today)) or 0)

    return VisionSummary(
        devices=len(devices), online=sum(1 for d in devices if _online(d)),
        events_today=count(ev.c.received_at >= today), pending=count(ev.c.status == EventStatus.PENDING.value),
        applied_today=count(ev.c.status == EventStatus.APPLIED.value, ev.c.received_at >= today),
        rejected_today=count(ev.c.status == EventStatus.REJECTED.value, ev.c.received_at >= today),
        counted_today=qty(EventType.COUNT), defects_today=qty(EventType.DEFECT),
    )

