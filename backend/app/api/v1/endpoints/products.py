from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import User
from app.models.product import ProductStatus
from app.schemas.product import (
    BOMItemCreate,
    BOMItemOut,
    BOMItemUpdate,
    ProductCreate,
    ProductListItem,
    ProductOut,
    ProductUpdate,
)
from app.services import product_service
from app.services.product_service import PRODUCT_EDITOR_ROLES

router = APIRouter(prefix="/products", tags=["Products & BOM"])

# O'qish — fabrikaning barcha xodimlari; o'zgartirish — faqat PRODUCT_EDITOR_ROLES
can_edit = require_roles(*PRODUCT_EDITOR_ROLES)


@router.get("", response_model=list[ProductListItem])
def list_products(
    search: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, max_length=100),
    status_: ProductStatus | None = Query(default=None, alias="status"),
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    return product_service.list_products(db, actor, search, category, status_, factory_id)


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    return product_service.list_categories(db, actor)


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    data: ProductCreate, db: Session = Depends(get_db), actor: User = Depends(can_edit)
):
    return product_service.create_product(db, actor, data)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(
    product_id: int, db: Session = Depends(get_db), actor: User = Depends(get_current_user)
):
    return product_service.get_product(db, actor, product_id)


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    data: ProductUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(can_edit),
):
    return product_service.update_product(db, actor, product_id, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int, db: Session = Depends(get_db), actor: User = Depends(can_edit)
):
    product_service.delete_product(db, actor, product_id)


# ---------- BOM ----------


@router.get("/{product_id}/bom", response_model=list[BOMItemOut])
def list_bom(
    product_id: int, db: Session = Depends(get_db), actor: User = Depends(get_current_user)
):
    return product_service.get_product(db, actor, product_id).bom_items


@router.post(
    "/{product_id}/bom", response_model=BOMItemOut, status_code=status.HTTP_201_CREATED
)
def add_bom_item(
    product_id: int,
    data: BOMItemCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(can_edit),
):
    return product_service.add_bom_item(db, actor, product_id, data)


@router.patch("/{product_id}/bom/{item_id}", response_model=BOMItemOut)
def update_bom_item(
    product_id: int,
    item_id: int,
    data: BOMItemUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(can_edit),
):
    return product_service.update_bom_item(db, actor, product_id, item_id, data)


@router.delete("/{product_id}/bom/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bom_item(
    product_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(can_edit),
):
    product_service.delete_bom_item(db, actor, product_id, item_id)
