from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.roles import Role
from app.models import User
from app.schemas.factory import FactoryCreate, FactoryOut, FactoryUpdate
from app.services import factory_service

router = APIRouter(prefix="/factories", tags=["Factories"])

super_admin_only = require_roles(Role.SUPER_ADMIN)


@router.get("", response_model=list[FactoryOut])
def list_factories(
    search: str | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    return factory_service.list_factories(db, actor, search)


@router.post("", response_model=FactoryOut, status_code=status.HTTP_201_CREATED)
def create_factory(
    data: FactoryCreate, db: Session = Depends(get_db), _: User = Depends(super_admin_only)
):
    return factory_service.create_factory(db, data)


@router.get("/{factory_id}", response_model=FactoryOut)
def get_factory(
    factory_id: int, db: Session = Depends(get_db), actor: User = Depends(get_current_user)
):
    return factory_service.get_factory(db, actor, factory_id)


@router.patch("/{factory_id}", response_model=FactoryOut)
def update_factory(
    factory_id: int,
    data: FactoryUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.SUPER_ADMIN, Role.FACTORY_OWNER)),
):
    return factory_service.update_factory(db, actor, factory_id, data)


@router.delete("/{factory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_factory(
    factory_id: int, db: Session = Depends(get_db), _: User = Depends(super_admin_only)
):
    factory_service.delete_factory(db, factory_id)
