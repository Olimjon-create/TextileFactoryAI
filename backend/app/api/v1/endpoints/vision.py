"""AI / Computer Vision: qurilma API'si (X-Device-Key) va boshqaruv (qurilmalar, hodisalar, qoidalar)."""

from datetime import date

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.models.vision import EventStatus, EventType
from app.schemas.vision import (
    ApplyRequest,
    DeviceCreate,
    DeviceOut,
    DeviceUpdate,
    DeviceWithKey,
    EventOut,
    EventPage,
    IngestRequest,
    IngestResponse,
    RejectRequest,
    RuleIn,
    RuleOut,
    RuleUpdate,
    VisionSummary,
)
from app.services import vision_service as svc

router = APIRouter(prefix="/vision", tags=["AI / Computer Vision"])
can_view = require_roles(*svc.VISION_VIEW_ROLES)
can_edit = require_roles(*svc.VISION_EDITOR_ROLES)


@router.post("/ingest", response_model=IngestResponse)
def ingest(
    data: IngestRequest,
    request: Request,
    x_device_key: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    """Kamera / AI-quti / sensor hodisalari (100 tagacha bir so'rovda). Bo'sh `events` — faqat "tirikman" signali.

    Qayta yuborish xavfsiz: `external_id` bir xil bo'lsa hodisa ikki marta yozilmaydi.
    """
    device = svc.authenticate(db, x_device_key)
    rate_limit.hit(f"device:{device.id}", 600, 60)
    return svc.ingest(db, device, data, rate_limit.client_ip(request))


@router.get("/summary", response_model=VisionSummary)
def summary(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.summary(db, actor, factory_id)


@router.get("/devices", response_model=list[DeviceOut])
def list_devices(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.list_devices(db, actor, factory_id)


@router.post("/devices", response_model=DeviceWithKey, status_code=status.HTTP_201_CREATED)
def create_device(data: DeviceCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_device(db, actor, data)


@router.get("/devices/{device_id}", response_model=DeviceOut)
def get_device(device_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.get_device(db, actor, device_id)


@router.patch("/devices/{device_id}", response_model=DeviceOut)
def update_device(device_id: int, data: DeviceUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_device(db, actor, device_id, data)


@router.post("/devices/{device_id}/rotate-key", response_model=DeviceWithKey)
def rotate_key(device_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.rotate_key(db, actor, device_id)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    svc.delete_device(db, actor, device_id)


@router.get("/events", response_model=EventPage)
def list_events(
    status_: EventStatus | None = Query(default=None, alias="status"),
    device_id: int | None = None,
    event_type: EventType | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_events(db, actor, status_=status_, device_id=device_id, event_type=event_type, date_from=date_from,
                           date_to=date_to, factory_id=factory_id, offset=offset, limit=limit)


@router.post("/events/{event_id}/apply", response_model=EventOut)
def apply_event(event_id: int, data: ApplyRequest, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.apply_event(db, actor, event_id, data)


@router.post("/events/{event_id}/reject", response_model=EventOut)
def reject_event(event_id: int, data: RejectRequest, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.reject_event(db, actor, event_id, data)


@router.get("/rules", response_model=list[RuleOut])
def list_rules(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.list_rules(db, actor, factory_id)


@router.post("/rules", response_model=RuleOut, status_code=status.HTTP_201_CREATED)
def create_rule(data: RuleIn, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_rule(db, actor, data)


@router.patch("/rules/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, data: RuleUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_rule(db, actor, rule_id, data)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(rule_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    svc.delete_rule(db, actor, rule_id)
