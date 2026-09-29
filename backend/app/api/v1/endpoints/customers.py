from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.models.customer import CustomerStatus, CustomerType
from app.schemas.customer import (
    CustomerCreate,
    CustomerOut,
    CustomerPage,
    CustomerStats,
    CustomerUpdate,
)
from app.services import customer_service
from app.services.customer_service import CUSTOMER_EDITOR_ROLES, CUSTOMER_VIEW_ROLES

router = APIRouter(prefix="/customers", tags=["Customers (CRM)"])

can_view = require_roles(*CUSTOMER_VIEW_ROLES)
can_edit = require_roles(*CUSTOMER_EDITOR_ROLES)


@router.get("", response_model=CustomerPage)
def list_customers(
    search: str | None = Query(default=None, max_length=100),
    status_: CustomerStatus | None = Query(default=None, alias="status"),
    customer_type: CustomerType | None = None,
    country: str | None = Query(default=None, min_length=2, max_length=2),
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return customer_service.list_customers(
        db,
        actor,
        search=search,
        status_=status_,
        customer_type=customer_type,
        country=country,
        factory_id=factory_id,
        offset=offset,
        limit=limit,
    )


@router.get("/countries", response_model=list[str])
def list_countries(db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return customer_service.list_countries(db, actor)


@router.get("/stats", response_model=CustomerStats)
def stats(db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return customer_service.get_stats(db, actor)


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(
    data: CustomerCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)
):
    return customer_service.create_customer(db, actor, data)


@router.get("/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db), actor: User = Depends(can_view)):
    return customer_service.get_customer(db, actor, customer_id)


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    data: CustomerUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(can_edit),
):
    return customer_service.update_customer(db, actor, customer_id, data)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)
):
    customer_service.delete_customer(db, actor, customer_id)
