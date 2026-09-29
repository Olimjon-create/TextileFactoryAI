import re

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.models import Customer, Factory, User
from app.models.customer import CustomerStatus, CustomerType
from app.schemas.customer import CustomerCreate, CustomerPage, CustomerStats, CustomerUpdate
from app.core.i18n import t

CUSTOMER_VIEW_ROLES = (
    Role.SUPER_ADMIN,
    Role.FACTORY_OWNER,
    Role.MANAGER,
    Role.PRODUCTION_MANAGER,
    Role.WAREHOUSE_MANAGER,
    Role.QUALITY_MANAGER,
)
CUSTOMER_EDITOR_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER)

AUTO_CODE_PREFIX = "CUS-"
_AUTO_CODE_RE = re.compile(rf"^{AUTO_CODE_PREFIX}(\d+)$")

_REQUIRED_FIELDS = {"name", "customer_code", "customer_type", "status"}


def _scoped(query, actor: User):
    if actor.role != Role.SUPER_ADMIN:
        query = query.where(Customer.factory_id == actor.factory_id)
    return query


def _get(db: Session, actor: User, customer_id: int) -> Customer:
    query = _scoped(
        select(Customer).options(selectinload(Customer.factory)).where(Customer.id == customer_id),
        actor,
    )
    customer = db.scalar(query)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mijoz topilmadi")
    return customer


def _resolve_factory_id(db: Session, actor: User, factory_id: int | None) -> int:
    if actor.role != Role.SUPER_ADMIN:
        return actor.factory_id
    if factory_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fabrikani tanlang")
    if db.get(Factory, factory_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fabrika topilmadi")
    return factory_id


def _ensure_code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None):
    query = select(Customer.id).where(
        Customer.factory_id == factory_id, Customer.customer_code == code
    )
    if exclude_id is not None:
        query = query.where(Customer.id != exclude_id)
    if db.scalar(query):
        raise HTTPException(status.HTTP_409_CONFLICT, t("'{code}' kodli mijoz allaqachon mavjud", code=code))


def _next_code(db: Session, factory_id: int) -> str:
    codes = db.scalars(
        select(Customer.customer_code).where(
            Customer.factory_id == factory_id,
            Customer.customer_code.like(f"{AUTO_CODE_PREFIX}%"),
        )
    )
    numbers = [int(m.group(1)) for c in codes if (m := _AUTO_CODE_RE.match(c))]
    return f"{AUTO_CODE_PREFIX}{(max(numbers, default=0) + 1):05d}"


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Bu kodli mijoz allaqachon mavjud")


def list_customers(
    db: Session,
    actor: User,
    *,
    search: str | None = None,
    status_: CustomerStatus | None = None,
    customer_type: CustomerType | None = None,
    country: str | None = None,
    factory_id: int | None = None,
    offset: int = 0,
    limit: int = 25,
) -> CustomerPage:
    query = _scoped(select(Customer), actor)
    if factory_id is not None and actor.role == Role.SUPER_ADMIN:
        query = query.where(Customer.factory_id == factory_id)
    if status_ is not None:
        query = query.where(Customer.status == status_)
    if customer_type is not None:
        query = query.where(Customer.customer_type == customer_type)
    if country:
        query = query.where(Customer.country == country.upper())
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Customer.name.ilike(pattern),
                Customer.customer_code.ilike(pattern),
                Customer.contact_person.ilike(pattern),
                Customer.phone.ilike(pattern),
                Customer.email.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(
        query.options(selectinload(Customer.factory))
        .order_by(Customer.created_at.desc(), Customer.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return CustomerPage(items=list(items), total=total)


def list_countries(db: Session, actor: User) -> list[str]:
    query = _scoped(
        select(Customer.country).where(Customer.country.is_not(None)).distinct(), actor
    ).order_by(Customer.country)
    return list(db.scalars(query))


def get_stats(db: Session, actor: User) -> CustomerStats:
    query = _scoped(select(Customer.status, func.count()).group_by(Customer.status), actor)
    by_status = {s.value: 0 for s in CustomerStatus}
    for status_value, count in db.execute(query):
        by_status[CustomerStatus(status_value).value] = count
    return CustomerStats(total=sum(by_status.values()), by_status=by_status)


def get_customer(db: Session, actor: User, customer_id: int) -> Customer:
    return _get(db, actor, customer_id)


def create_customer(db: Session, actor: User, data: CustomerCreate) -> Customer:
    factory_id = _resolve_factory_id(db, actor, data.factory_id)
    code = data.customer_code or _next_code(db, factory_id)
    _ensure_code_free(db, factory_id, code)

    customer = Customer(
        factory_id=factory_id,
        customer_code=code,
        **data.model_dump(exclude={"factory_id", "customer_code"}),
    )
    db.add(customer)
    _commit(db)
    return _get(db, actor, customer.id)


def update_customer(db: Session, actor: User, customer_id: int, data: CustomerUpdate) -> Customer:
    customer = _get(db, actor, customer_id)
    changes = data.model_dump(exclude_unset=True)

    code = changes.get("customer_code")
    if code and code != customer.customer_code:
        _ensure_code_free(db, customer.factory_id, code, exclude_id=customer.id)

    for field, value in changes.items():
        if value is None and field in _REQUIRED_FIELDS:
            continue
        setattr(customer, field, value)

    _commit(db)
    return _get(db, actor, customer.id)


def delete_customer(db: Session, actor: User, customer_id: int) -> None:
    customer = _get(db, actor, customer_id)
    db.delete(customer)
    db.commit()
