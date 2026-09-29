from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.roles import USER_MANAGER_ROLES, Role
from app.models import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])

can_manage_users = require_roles(*USER_MANAGER_ROLES)


@router.get("", response_model=list[UserOut])
def list_users(
    factory_id: int | None = None,
    role: Role | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(can_manage_users),
):
    return user_service.list_users(db, actor, factory_id, role, search)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate, db: Session = Depends(get_db), actor: User = Depends(can_manage_users)
):
    return user_service.create_user(db, actor, data)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), actor: User = Depends(can_manage_users)):
    return user_service.get_user(db, actor, user_id)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(can_manage_users),
):
    return user_service.update_user(db, actor, user_id, data)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int, db: Session = Depends(get_db), actor: User = Depends(can_manage_users)
):
    user_service.delete_user(db, actor, user_id)
