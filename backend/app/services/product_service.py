from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.models import BOMItem, Factory, Material, Product, ProductStockMovement, User
from app.models.audit import AuditAction
from app.models.product import ProductStatus
from app.schemas.product import (
    BOMItemCreate,
    BOMItemUpdate,
    ProductCreate,
    ProductListItem,
    ProductOut,
    ProductUpdate,
)
from app.services import audit_service
from app.core.i18n import t

# Mahsulot va BOM ma'lumotlarini o'zgartira oladigan rollar.
# Qolgan fabrika xodimlari (ombor, sifat, ishchi) faqat ko'ra oladi.
PRODUCT_EDITOR_ROLES = (
    Role.SUPER_ADMIN,
    Role.FACTORY_OWNER,
    Role.MANAGER,
    Role.PRODUCTION_MANAGER,
)


# ---------- yordamchi funksiyalar ----------


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Mahsulot topilmadi")


def _scoped(query, actor: User):
    if actor.role != Role.SUPER_ADMIN:
        query = query.where(Product.factory_id == actor.factory_id)
    return query


def _bom_count_subquery():
    return (
        select(func.count(BOMItem.id))
        .where(BOMItem.product_id == Product.id)
        .correlate(Product)
        .scalar_subquery()
    )


def _get_product(db: Session, actor: User, product_id: int) -> Product:
    query = _scoped(
        select(Product)
        .options(selectinload(Product.bom_items), selectinload(Product.factory))
        .where(Product.id == product_id),
        actor,
    )
    product = db.scalar(query)
    if product is None:
        raise _not_found()
    return product


def _ensure_code_free(db: Session, factory_id: int, code: str, exclude_id: int | None = None):
    query = select(Product.id).where(Product.factory_id == factory_id, Product.code == code)
    if exclude_id is not None:
        query = query.where(Product.id != exclude_id)
    if db.scalar(query):
        raise HTTPException(status.HTTP_409_CONFLICT, t("'{code}' kodli mahsulot allaqachon mavjud", code=code))


def _resolve_factory_id(db: Session, actor: User, factory_id: int | None) -> int:
    if actor.role != Role.SUPER_ADMIN:
        return actor.factory_id  # type: ignore[return-value]
    if factory_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fabrikani tanlang")
    if db.get(Factory, factory_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fabrika topilmadi")
    return factory_id


def _to_out(product: Product) -> ProductOut:
    out = ProductOut.model_validate(product)
    out.bom_items_count = len(product.bom_items)
    return out


# ---------- mahsulotlar ----------


def list_products(
    db: Session,
    actor: User,
    search: str | None = None,
    category: str | None = None,
    status_: ProductStatus | None = None,
    factory_id: int | None = None,
) -> list[ProductListItem]:
    bom_count = _bom_count_subquery().label("bom_items_count")
    query = _scoped(
        select(Product, bom_count).options(selectinload(Product.factory)), actor
    ).order_by(Product.updated_at.desc(), Product.id.desc())

    if factory_id is not None and actor.role == Role.SUPER_ADMIN:
        query = query.where(Product.factory_id == factory_id)
    if category:
        query = query.where(Product.category == category)
    if status_ is not None:
        query = query.where(Product.status == status_)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Product.name.ilike(pattern), Product.code.ilike(pattern)))

    result = []
    for product, count in db.execute(query):
        item = ProductListItem.model_validate(product)
        item.bom_items_count = count or 0
        result.append(item)
    return result


def list_categories(db: Session, actor: User) -> list[str]:
    query = _scoped(select(Product.category).distinct(), actor).order_by(Product.category)
    return list(db.scalars(query))


def get_product(db: Session, actor: User, product_id: int) -> ProductOut:
    return _to_out(_get_product(db, actor, product_id))


def create_product(db: Session, actor: User, data: ProductCreate) -> ProductOut:
    factory_id = _resolve_factory_id(db, actor, data.factory_id)
    _ensure_code_free(db, factory_id, data.code)

    product = Product(
        factory_id=factory_id,
        **data.model_dump(exclude={"factory_id", "bom_items"}),
        bom_items=[BOMItem(**_link_material(db, factory_id, item.model_dump())) for item in data.bom_items],
    )
    db.add(product)
    db.flush()
    audit_service.record(
        db, actor, entity="product", entity_id=product.id, action=AuditAction.CREATE,
        summary=f"Mahsulot qo'shildi: {product.code} — {product.name}", factory_id=factory_id,
    )
    db.commit()
    return get_product(db, actor, product.id)


def update_product(db: Session, actor: User, product_id: int, data: ProductUpdate) -> ProductOut:
    product = _get_product(db, actor, product_id)
    changes = data.model_dump(exclude_unset=True)

    if changes.get("code") and changes["code"] != product.code:
        _ensure_code_free(db, product.factory_id, changes["code"], exclude_id=product.id)

    # description/price/rasmlar bo'shatilishi mumkin, qolgan maydonlarda None — "o'zgartirmaslik"
    values = {f: v for f, v in changes.items() if v is not None or f in ("description", "price", "image_url", "model_image_url")}
    diff = audit_service.diff(product, values)
    for field, value in values.items():
        setattr(product, field, value)
    if diff:
        audit_service.record(
            db, actor, entity="product", entity_id=product.id, action=AuditAction.UPDATE,
            summary=f"Mahsulot o'zgartirildi: {product.code}", factory_id=product.factory_id, changes=diff,
        )
    db.commit()
    return get_product(db, actor, product.id)


def delete_product(db: Session, actor: User, product_id: int) -> None:
    product = _get_product(db, actor, product_id)
    if db.scalar(select(ProductStockMovement.id).where(ProductStockMovement.product_id == product.id).limit(1)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Mahsulotning tayyor mahsulot ombori tarixi bor — o'chirish o'rniga arxivlang")
    audit_service.record(
        db, actor, entity="product", entity_id=product.id, action=AuditAction.DELETE,
        summary=f"Mahsulot o'chirildi: {product.code} — {product.name}", factory_id=product.factory_id,
    )
    db.delete(product)
    db.commit()


# ---------- BOM ----------


def _get_bom_item(product: Product, item_id: int) -> BOMItem:
    for item in product.bom_items:
        if item.id == item_id:
            return item
    raise HTTPException(status.HTTP_404_NOT_FOUND, "BOM qatori topilmadi")


def _link_material(db: Session, factory_id: int, values: dict) -> dict:
    """material_id berilgan bo'lsa — o'sha zavod katalogidan; nom, tur va birlik katalogdan olinadi."""
    material_id = values.get("material_id")
    if material_id is None:
        return values
    material = db.get(Material, material_id)
    if material is None or material.factory_id != factory_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Material katalogda topilmadi")
    return {**values, "material_name": material.name, "material_type": material.material_type, "unit": material.unit}


def add_bom_item(db: Session, actor: User, product_id: int, data: BOMItemCreate) -> BOMItem:
    product = _get_product(db, actor, product_id)
    item = BOMItem(product_id=product.id, **_link_material(db, product.factory_id, data.model_dump()))
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_bom_item(
    db: Session, actor: User, product_id: int, item_id: int, data: BOMItemUpdate
) -> BOMItem:
    product = _get_product(db, actor, product_id)
    item = _get_bom_item(product, item_id)
    for field, value in _link_material(db, product.factory_id, data.model_dump(exclude_unset=True)).items():
        # material_id = null — katalog bilan bog'lanishni uzish
        if value is not None or field in ("notes", "material_id"):
            setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_bom_item(db: Session, actor: User, product_id: int, item_id: int) -> None:
    product = _get_product(db, actor, product_id)
    product.bom_items.remove(_get_bom_item(product, item_id))
    db.commit()
