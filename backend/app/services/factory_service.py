from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.roles import Role
from app.models import Factory, Order, ProductStockMovement, PurchaseOrder, StockMovement, User, WorkOrder
from app.schemas.factory import FactoryCreate, FactoryOut, FactoryUpdate

_CLEARABLE_FIELDS = {
    "address",
    "phone",
    "city",
    "short_description",
    "description",
    "logo_url",
    "cover_url",
}


def _to_out(db: Session, factory: Factory) -> FactoryOut:
    count = db.scalar(select(func.count(User.id)).where(User.factory_id == factory.id)) or 0
    out = FactoryOut.model_validate(factory)
    out.users_count = count
    return out


def _get_accessible(db: Session, actor: User, factory_id: int) -> Factory:
    factory = db.get(Factory, factory_id)
    if factory is None or (actor.role != Role.SUPER_ADMIN and actor.factory_id != factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fabrika topilmadi")
    return factory


def list_factories(db: Session, actor: User, search: str | None = None) -> list[FactoryOut]:
    query = select(Factory).order_by(Factory.id.desc())
    if actor.role != Role.SUPER_ADMIN:
        query = query.where(Factory.id == actor.factory_id)
    if search:
        query = query.where(Factory.name.ilike(f"%{search.strip()}%"))
    return [_to_out(db, f) for f in db.scalars(query)]


def get_factory(db: Session, actor: User, factory_id: int) -> FactoryOut:
    return _to_out(db, _get_accessible(db, actor, factory_id))


def create_factory(db: Session, data: FactoryCreate) -> FactoryOut:
    factory = Factory(**data.model_dump())
    db.add(factory)
    db.commit()
    db.refresh(factory)
    return _to_out(db, factory)


def update_factory(db: Session, actor: User, factory_id: int, data: FactoryUpdate) -> FactoryOut:
    factory = _get_accessible(db, actor, factory_id)
    if actor.role not in (Role.SUPER_ADMIN, Role.FACTORY_OWNER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Ruxsat yo'q")
    changes = data.model_dump(exclude_unset=True)
    if actor.role != Role.SUPER_ADMIN:
        changes.pop("is_active", None)
    for field, value in changes.items():
        if value is not None or field in _CLEARABLE_FIELDS:
            setattr(factory, field, value)
    db.commit()
    db.refresh(factory)
    return _to_out(db, factory)


def delete_factory(db: Session, factory_id: int) -> None:
    factory = db.get(Factory, factory_id)
    if factory is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fabrika topilmadi")
    history = (Order, StockMovement, ProductStockMovement, WorkOrder, PurchaseOrder)
    if any(db.scalar(select(m.id).where(m.factory_id == factory_id).limit(1)) is not None for m in history):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Fabrikada buyurtma, ombor, ishlab chiqarish yoki xarid tarixi bor — o'chirish o'rniga nofaol qiling",
        )
    db.execute(delete(User).where(User.factory_id == factory_id))
    db.delete(factory)
    db.commit()
