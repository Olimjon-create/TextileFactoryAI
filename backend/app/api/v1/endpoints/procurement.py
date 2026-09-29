"""Ta'minot: yetkazib beruvchilar va xarid buyurtmalari (qabul qilish — ombor kirimi orqali)."""

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import PurchaseStatus, User
from app.schemas.procurement import (
    ProcurementSummary,
    PurchaseOrderCreate,
    PurchaseOrderDetail,
    PurchaseOrderPage,
    PurchaseOrderUpdate,
    ReceiveRequest,
    SupplierCreate,
    SupplierDetail,
    SupplierPage,
    SupplierUpdate,
)
from app.services import procurement_service as svc

router = APIRouter(tags=["Procurement"])
can_view = require_roles(*svc.PROCUREMENT_VIEW_ROLES)
can_edit = require_roles(*svc.PROCUREMENT_EDITOR_ROLES)


@router.get("/procurement/summary", response_model=ProcurementSummary)
def summary(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.summary(db, actor, factory_id)


@router.get("/suppliers", response_model=SupplierPage)
def list_suppliers(
    search: str | None = Query(default=None, max_length=100),
    is_active: bool | None = True,
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_suppliers(db, actor, search=search, is_active=is_active, factory_id=factory_id, offset=offset, limit=limit)


@router.post("/suppliers", response_model=SupplierDetail, status_code=status.HTTP_201_CREATED)
def create_supplier(data: SupplierCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_supplier(db, actor, data)


@router.get("/suppliers/{supplier_id}", response_model=SupplierDetail)
def get_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.get_supplier(db, actor, supplier_id)


@router.patch("/suppliers/{supplier_id}", response_model=SupplierDetail)
def update_supplier(supplier_id: int, data: SupplierUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_supplier(db, actor, supplier_id, data)


@router.delete("/suppliers/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    svc.delete_supplier(db, actor, supplier_id)


@router.get("/purchase-orders", response_model=PurchaseOrderPage)
def list_purchase_orders(
    status_: PurchaseStatus | None = Query(default=None, alias="status"),
    supplier_id: int | None = None,
    order_id: int | None = None,
    overdue: bool = False,
    open_only: bool = False,
    search: str | None = Query(default=None, max_length=100),
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=200),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return svc.list_purchase_orders(
        db, actor, status_=status_, supplier_id=supplier_id, order_id=order_id, overdue=overdue, open_only=open_only,
        search=search, factory_id=factory_id, offset=offset, limit=limit,
    )


@router.post("/purchase-orders", response_model=PurchaseOrderDetail, status_code=status.HTTP_201_CREATED)
def create_purchase_order(data: PurchaseOrderCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.create_purchase_order(db, actor, data)


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderDetail)
def get_purchase_order(po_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return svc.get_purchase_order(db, actor, po_id)


@router.patch("/purchase-orders/{po_id}", response_model=PurchaseOrderDetail)
def update_purchase_order(po_id: int, data: PurchaseOrderUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.update_purchase_order(db, actor, po_id, data)


@router.delete("/purchase-orders/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase_order(po_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    svc.delete_purchase_order(db, actor, po_id)


@router.post("/purchase-orders/{po_id}/submit", response_model=PurchaseOrderDetail)
def submit(po_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.submit(db, actor, po_id)


@router.post("/purchase-orders/{po_id}/receive", response_model=PurchaseOrderDetail)
def receive(po_id: int, data: ReceiveRequest, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.receive(db, actor, po_id, data)


@router.post("/purchase-orders/{po_id}/close", response_model=PurchaseOrderDetail)
def close(po_id: int, reason: str | None = Body(default=None, embed=True, max_length=300), db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.close(db, actor, po_id, reason)


@router.post("/purchase-orders/{po_id}/cancel", response_model=PurchaseOrderDetail)
def cancel(po_id: int, reason: str | None = Body(default=None, embed=True, max_length=300), db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return svc.cancel(db, actor, po_id, reason)
