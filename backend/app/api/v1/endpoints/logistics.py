"""Tayyor mahsulot ombori va jo'natmalar."""

from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import ProductMovementType, ShipmentStatus, User
from app.schemas.logistics import (
    DeliverRequest,
    FgMovementCreate,
    FgMovementOut,
    FgMovementPage,
    FgSummary,
    OrderShipping,
    ProductionReceiptCreate,
    ShipmentCreate,
    ShipmentDetail,
    ShipmentPage,
    ShipmentUpdate,
    ShipRequest,
    StockPage,
    WorkOrderStock,
)
from app.services import logistics_service as svc

router = APIRouter(tags=["Logistics"])
can_view = require_roles(*svc.LOGISTICS_VIEW_ROLES)
can_edit = require_roles(*svc.LOGISTICS_EDITOR_ROLES)
can_receive = require_roles(*svc.FG_RECEIVE_ROLES)


# ---------- tayyor mahsulot ombori ----------


@router.get("/finished-goods/summary", response_model=FgSummary)
def summary(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.summary(db, actor, factory_id)


@router.get("/finished-goods/stock", response_model=StockPage)
def list_stock(
    search: str | None = Query(default=None, max_length=100),
    location_id: int | None = None,
    product_id: int | None = None,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_stock(db, actor, search=search, location_id=location_id, product_id=product_id, factory_id=factory_id, offset=offset, limit=limit)


@router.get("/finished-goods/movements", response_model=FgMovementPage)
def list_movements(
    movement_type: ProductMovementType | None = None,
    product_id: int | None = None,
    location_id: int | None = None,
    work_order_id: int | None = None,
    shipment_id: int | None = None,
    order_id: int | None = None,
    search: str | None = Query(default=None, max_length=100),
    date_from: date | None = None,
    date_to: date | None = None,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_movements(
        db, actor, movement_type=movement_type, product_id=product_id, location_id=location_id, work_order_id=work_order_id,
        shipment_id=shipment_id, order_id=order_id, search=search, date_from=date_from, date_to=date_to,
        factory_id=factory_id, offset=offset, limit=limit,
    )


@router.post("/finished-goods/movements", response_model=FgMovementOut, status_code=status.HTTP_201_CREATED)
def create_movement(data: FgMovementCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_movement(db, actor, data)


@router.get("/finished-goods/work-orders/{wo_id}", response_model=WorkOrderStock)
def work_order_stock(wo_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.work_order_stock(db, actor, wo_id)


@router.post("/finished-goods/receive", response_model=WorkOrderStock)
def receive(data: ProductionReceiptCreate, db: Session = Depends(get_db), actor: User = Depends(can_receive)):
    return svc.receive_from_work_order(db, actor, data)


# ---------- jo'natmalar ----------


@router.get("/shipments", response_model=ShipmentPage)
def list_shipments(
    status_: ShipmentStatus | None = Query(default=None, alias="status"),
    order_id: int | None = None,
    late: bool = False,
    search: str | None = Query(default=None, max_length=100),
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_shipments(db, actor, status_=status_, order_id=order_id, late=late, search=search, factory_id=factory_id, offset=offset, limit=limit)


@router.post("/shipments", response_model=ShipmentDetail, status_code=status.HTTP_201_CREATED)
def create_shipment(data: ShipmentCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_shipment(db, actor, data)


@router.get("/shipments/{shipment_id}", response_model=ShipmentDetail)
def get_shipment(shipment_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.get_shipment(db, actor, shipment_id)


@router.patch("/shipments/{shipment_id}", response_model=ShipmentDetail)
def update_shipment(shipment_id: int, data: ShipmentUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_shipment(db, actor, shipment_id, data)


@router.post("/shipments/{shipment_id}/ship", response_model=ShipmentDetail)
def ship(shipment_id: int, data: ShipRequest, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.ship(db, actor, shipment_id, data)


@router.post("/shipments/{shipment_id}/deliver", response_model=ShipmentDetail)
def deliver(shipment_id: int, data: DeliverRequest, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.deliver(db, actor, shipment_id, data)


@router.post("/shipments/{shipment_id}/cancel", response_model=ShipmentDetail)
def cancel(shipment_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.cancel(db, actor, shipment_id)


@router.get("/orders/{order_id}/shipping", response_model=OrderShipping)
def order_shipping(order_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.order_shipping(db, actor, order_id)
