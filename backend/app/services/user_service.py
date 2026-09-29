from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role, can_manage_role
from app.core.security import hash_password, is_weak_password, set_password
from app.models import Factory, User
from app.schemas.user import UserCreate, UserUpdate


def _forbidden(detail: str = "Ruxsat yo'q") -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail)


def _ensure_can_manage(actor: User, role: Role, factory_id: int | None) -> None:
    """actor berilgan rol va fabrikadagi foydalanuvchini boshqara oladimi."""
    if actor.role == Role.SUPER_ADMIN:
        return
    if factory_id != actor.factory_id:
        raise _forbidden("Faqat o'z fabrikangiz foydalanuvchilarini boshqara olasiz")
    if not can_manage_role(actor.role, role):
        raise _forbidden("Bu rol bilan foydalanuvchini boshqara olmaysiz")


def _resolve_factory_id(db: Session, actor: User, role: Role, factory_id: int | None) -> int | None:
    if role == Role.SUPER_ADMIN:
        return None
    if actor.role != Role.SUPER_ADMIN:
        return actor.factory_id
    if factory_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fabrikani tanlang")
    if db.get(Factory, factory_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fabrika topilmadi")
    return factory_id


def _ensure_email_free(db: Session, email: str, exclude_id: int | None = None) -> None:
    query = select(User.id).where(User.email == email)
    if exclude_id is not None:
        query = query.where(User.id != exclude_id)
    if db.scalar(query):
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu email band")


def list_users(
    db: Session,
    actor: User,
    factory_id: int | None = None,
    role: Role | None = None,
    search: str | None = None,
) -> list[User]:
    query = select(User).options(selectinload(User.factory)).order_by(User.id.desc())
    if actor.role == Role.SUPER_ADMIN:
        if factory_id is not None:
            query = query.where(User.factory_id == factory_id)
    else:
        query = query.where(User.factory_id == actor.factory_id)
    if role is not None:
        query = query.where(User.role == role)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    return list(db.scalars(query))


def get_user(db: Session, actor: User, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or (actor.role != Role.SUPER_ADMIN and user.factory_id != actor.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foydalanuvchi topilmadi")
    return user


def create_user(db: Session, actor: User, data: UserCreate) -> User:
    new_factory = None
    if data.factory_name and data.factory_id is None:
        if actor.role != Role.SUPER_ADMIN or data.role != Role.FACTORY_OWNER:
            raise _forbidden("Yangi fabrikani faqat super admin zavod egasi bilan birga ocha oladi")
        _ensure_email_free(db, data.email.lower())
        new_factory = Factory(name=data.factory_name.strip(), phone=data.phone)
        db.add(new_factory)
        db.flush()
        data = data.model_copy(update={"factory_id": new_factory.id})
    factory_id = _resolve_factory_id(db, actor, data.role, data.factory_id)
    _ensure_can_manage(actor, data.role, factory_id)
    email = data.email.lower()
    _ensure_email_free(db, email)

    user = User(
        email=email,
        full_name=data.full_name,
        phone=data.phone,
        hashed_password=hash_password(data.password),
        password_weak=is_weak_password(data.password, data.email),
        role=data.role,
        factory_id=factory_id,
        is_active=data.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, actor: User, user_id: int, data: UserUpdate) -> User:
    user = get_user(db, actor, user_id)
    if user.id == actor.id:
        raise _forbidden("O'z hisobingizni bu yerda tahrirlab bo'lmaydi")
    _ensure_can_manage(actor, user.role, user.factory_id)

    changes = data.model_dump(exclude_unset=True)
    new_role = changes.get("role") or user.role
    new_factory_id = _resolve_factory_id(
        db, actor, new_role, changes.get("factory_id", user.factory_id)
    )
    _ensure_can_manage(actor, new_role, new_factory_id)

    if "email" in changes and changes["email"]:
        changes["email"] = changes["email"].lower()
        _ensure_email_free(db, changes["email"], exclude_id=user.id)
    if changes.get("password"):
        set_password(user, changes.pop("password"))
    changes.pop("password", None)

    for field in ("email", "full_name", "phone", "is_active"):
        if field in changes and changes[field] is not None:
            setattr(user, field, changes[field])
    user.role = new_role
    user.factory_id = new_factory_id

    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, actor: User, user_id: int) -> None:
    user = get_user(db, actor, user_id)
    if user.id == actor.id:
        raise _forbidden("O'zingizni o'chira olmaysiz")
    _ensure_can_manage(actor, user.role, user.factory_id)
    db.delete(user)
    db.commit()
