"""Ombor: materiallar katalogi, joylashuvlar, harakatlar (kirim/chiqim/ko'chirish/inventarizatsiya)."""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import MovementType, User
from app.models.product import MaterialType
from app.schemas.inventory import (
    InventorySummary,
    LocationCreate,
    LocationOut,
    LocationUpdate,
    MaterialCreate,
    MaterialDetail,
    MaterialPage,
    MaterialUpdate,
    MovementCreate,
    MovementOut,
    MovementPage,
)
from app.services import inventory_service as svc

router = APIRouter(prefix="/inventory", tags=["Warehouse / Inventory"])
can_view = require_roles(*svc.INVENTORY_VIEW_ROLES)
can_edit = require_roles(*svc.INVENTORY_EDITOR_ROLES)


@router.get("/summary", response_model=InventorySummary)
def summary(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.summary(db, actor, factory_id)


@router.get("/materials", response_model=MaterialPage)
def list_materials(
    search: str | None = Query(default=None, max_length=100),
    material_type: MaterialType | None = None,
    stock_state: Literal["low", "out", "in"] | None = None,
    is_active: bool | None = True,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_materials(
        db, actor, search=search, material_type=material_type, stock_state=stock_state,
        is_active=is_active, factory_id=factory_id, offset=offset, limit=limit,
    )


@router.post("/materials", response_model=MaterialDetail, status_code=status.HTTP_201_CREATED)
def create_material(data: MaterialCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_material(db, actor, data)


@router.get("/materials/{material_id}", response_model=MaterialDetail)
def get_material(material_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.get_material(db, actor, material_id)


@router.patch("/materials/{material_id}", response_model=MaterialDetail)
def update_material(material_id: int, data: MaterialUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_material(db, actor, material_id, data)


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(material_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    svc.delete_material(db, actor, material_id)


@router.get("/locations", response_model=list[LocationOut])
def list_locations(
    include_inactive: bool = False,
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_locations(db, actor, include_inactive=include_inactive, factory_id=factory_id)


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(data: LocationCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_location(db, actor, data)


@router.patch("/locations/{location_id}", response_model=LocationOut)
def update_location(location_id: int, data: LocationUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_location(db, actor, location_id, data)


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(location_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    svc.delete_location(db, actor, location_id)


@router.get("/movements", response_model=MovementPage)
def list_movements(
    material_id: int | None = None,
    location_id: int | None = None,
    movement_type: MovementType | None = None,
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
        db, actor, material_id=material_id, location_id=location_id, movement_type=movement_type,
        order_id=order_id, search=search, date_from=date_from, date_to=date_to, factory_id=factory_id,
        offset=offset, limit=limit,
    )


@router.post("/movements", response_model=list[MovementOut], status_code=status.HTTP_201_CREATED)
def create_movement(data: MovementCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    """Ko'chirish (TRANSFER) ikki yozuv qaytaradi: chiqish va kirish."""
    return svc.create_movement(db, actor, data)
