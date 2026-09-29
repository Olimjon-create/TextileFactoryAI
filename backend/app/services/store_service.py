"""Ochiq katalog: zavodlar va mahsulotlarni ko'rsatish, buyurtma yaratish va to'lash.

Login talab qilinmaydi, shuning uchun:
  - faqat faol + katalogda ko'rsatilishi yoqilgan zavodlar va ularning FAOL, narxi bor mahsulotlari;
  - narx va jami summa har doim serverda hisoblanadi (mijoz yuborgan narxga ishonilmaydi);
  - buyurtmaga faqat taxmin qilib bo'lmaydigan public_token orqali murojaat qilinadi.
"""

import secrets
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Factory, Order, OrderItem, Product, ProductStockMovement
from app.models.order import OrderStatus, PaymentStatus
from app.models.product import ProductStatus
from app.schemas.store import (
    CheckoutRequest,
    CheckoutResponse,
    PaymentInfo,
    PublicOrder,
    PublicOrderItem,
    StoreCatalogProduct,
    StoreCategoryCount,
    StoreFactoryCard,
    StoreFactoryDetail,
    StoreFeaturedProduct,
    StoreProduct,
    StoreProductPage,
)
from app.core.i18n import get_lang
from app.services import order_service, payments, telegram_service

CURRENCY = "UZS"


def _public_factories():
    return select(Factory).where(Factory.is_active.is_(True), Factory.is_public.is_(True))


def _storefront_products():
    return select(Product).where(
        Product.status == ProductStatus.ACTIVE,
        Product.price.is_not(None),
        Product.price > 0,
    )


def _stock(db: Session, product_ids: list[int]) -> dict[int, int]:
    if not product_ids:
        return {}
    rows = db.execute(
        select(ProductStockMovement.product_id, func.coalesce(func.sum(ProductStockMovement.quantity), 0))
        .where(ProductStockMovement.product_id.in_(product_ids))
        .group_by(ProductStockMovement.product_id)
    )
    return {pid: max(int(qty), 0) for pid, qty in rows}


def _store_product(product: Product, stock: dict[int, int]) -> StoreProduct:
    return StoreProduct.model_validate(product).model_copy(update={"in_stock": stock.get(product.id, 0)})


def _get_public_factory(db: Session, factory_id: int) -> Factory:
    factory = db.scalar(_public_factories().where(Factory.id == factory_id))
    if factory is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Zavod topilmadi")
    return factory


def list_factories(db: Session, search: str | None = None) -> list[StoreFactoryCard]:
    products = _storefront_products().subquery()
    stats = (
        select(
            products.c.factory_id,
            func.count(products.c.id).label("product_count"),
            func.min(products.c.price).label("min_price"),
        )
        .group_by(products.c.factory_id)
        .subquery()
    )
    query = (
        _public_factories()
        .join(stats, stats.c.factory_id == Factory.id)
        .add_columns(stats.c.product_count, stats.c.min_price)
        .order_by(stats.c.product_count.desc(), Factory.name)
    )
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(Factory.name.ilike(pattern) | Factory.short_description.ilike(pattern))

    rows = db.execute(query).all()
    categories: dict[int, list[str]] = {}
    if rows:
        cat_rows = db.execute(
            select(Product.factory_id, Product.category, func.count())
            .where(Product.id.in_(select(products.c.id)))
            .where(Product.factory_id.in_([f.id for f, *_ in rows]))
            .group_by(Product.factory_id, Product.category)
            .order_by(func.count().desc())
        )
        for factory_id, category, _ in cat_rows:
            categories.setdefault(factory_id, []).append(category)

    return [
        StoreFactoryCard(
            id=f.id,
            name=f.name,
            city=f.city,
            short_description=f.short_description,
            logo_url=f.logo_url,
            cover_url=f.cover_url,
            product_count=count,
            categories=categories.get(f.id, [])[:4],
            min_price=float(min_price) if min_price is not None else None,
        )
        for f, count, min_price in rows
    ]


PRODUCT_SORTS = {
    "new": (Product.id.desc(),),
    "price_asc": (Product.price.asc(), Product.id.desc()),
    "price_desc": (Product.price.desc(), Product.id.desc()),
}


def list_products(
    db: Session, search: str | None = None, category: str | None = None,
    sort: str = "new", limit: int = 12, offset: int = 0,
) -> StoreProductPage:
    base = (
        _storefront_products()
        .join(Factory, Factory.id == Product.factory_id)
        .where(Factory.is_active.is_(True), Factory.is_public.is_(True))
    )
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        base = base.where(
            Product.name.ilike(pattern) | Product.category.ilike(pattern)
            | Product.description.ilike(pattern) | Factory.name.ilike(pattern)
        )
    ids = base.with_only_columns(Product.id).subquery()
    categories = [
        StoreCategoryCount(name=name, count=count)
        for name, count in db.execute(
            select(Product.category, func.count())
            .where(Product.id.in_(select(ids.c.id)))
            .group_by(Product.category)
            .order_by(func.count().desc(), Product.category)
        )
    ]
    if category:
        base = base.where(Product.category == category)
    total = db.scalar(select(func.count()).select_from(base.with_only_columns(Product.id).subquery())) or 0
    rows = db.execute(
        base.add_columns(Factory.name).order_by(*PRODUCT_SORTS.get(sort, PRODUCT_SORTS["new"])).limit(limit).offset(offset)
    ).all()
    stock = _stock(db, [product.id for product, _ in rows])
    items = [
        StoreCatalogProduct(
            **_store_product(product, stock).model_dump(), factory_id=product.factory_id, factory_name=factory_name
        )
        for product, factory_name in rows
    ]
    return StoreProductPage(items=items, total=total, categories=categories)


def featured_products(db: Session, limit: int = 3) -> list[StoreFeaturedProduct]:
    """Har xil zavodlardan tasodifiy tanlangan, surati bor mahsulotlar (har zavoddan bittadan).

    Odam ustidagi surati bor mahsulotlar afzal — kollajda ular chiroyliroq ko'rinadi.
    """
    rows = db.execute(
        _storefront_products()
        .join(Factory, Factory.id == Product.factory_id)
        .where(Factory.is_active.is_(True), Factory.is_public.is_(True))
        .where((Product.model_image_url.is_not(None)) | (Product.image_url.is_not(None)))
        .add_columns(Factory.name)
        .order_by(Product.model_image_url.is_(None), func.random())
        .limit(100)
    ).all()

    result: list[StoreFeaturedProduct] = []
    seen: set[int] = set()
    for product, factory_name in rows:
        if product.factory_id in seen:
            continue
        seen.add(product.factory_id)
        result.append(
            StoreFeaturedProduct(
                product_id=product.id,
                product_name=product.name,
                factory_id=product.factory_id,
                factory_name=factory_name,
                image_url=product.model_image_url or product.image_url,
                price=float(product.price),
            )
        )
        if len(result) == limit:
            break
    return result


def get_factory(db: Session, factory_id: int) -> StoreFactoryDetail:
    factory = _get_public_factory(db, factory_id)
    products = list(db.scalars(
        _storefront_products()
        .where(Product.factory_id == factory.id)
        .order_by(Product.category, Product.name)
    ))
    stock = _stock(db, [p.id for p in products])
    return StoreFactoryDetail(
        id=factory.id,
        name=factory.name,
        city=factory.city,
        address=factory.address,
        phone=factory.phone,
        short_description=factory.short_description,
        description=factory.description,
        logo_url=factory.logo_url,
        cover_url=factory.cover_url,
        products=[_store_product(p, stock) for p in products],
    )


def _public_order(order: Order) -> PublicOrder:
    return PublicOrder(
        order_number=order.order_number,
        public_token=order.public_token,
        factory_id=order.factory_id,
        factory_name=order.factory.name,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        delivery_address=order.delivery_address,
        status=order.status,
        payment_status=order.payment_status,
        card_last4=order.card_last4,
        total_amount=float(order.total_amount),
        currency=order.currency,
        items=[PublicOrderItem.model_validate(i) for i in order.items],
        created_at=order.created_at,
        paid_at=order.paid_at,
    )


def _get_order_by_token(db: Session, token: str) -> Order:
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.factory))
        .where(Order.public_token == token)
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buyurtma topilmadi")
    return order


def _check_variant(product: Product, size: str | None, color: str | None) -> None:
    """O'lcham/rang mahsulotda bo'lsa — tanlanishi shart va ro'yxatdagi qiymat bo'lishi kerak."""
    for value, options, label in ((size, product.sizes, "o'lcham"), (color, product.colors, "rang")):
        if options and value not in options:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"\"{product.name}\" uchun {label}ni tanlang"
                if value is None
                else f"\"{product.name}\" uchun bunday {label} yo'q: {value}",
            )
        if not options and value is not None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"\"{product.name}\" uchun {label} tanlanmaydi"
            )


def create_order(db: Session, data: CheckoutRequest) -> CheckoutResponse:
    factory = _get_public_factory(db, data.factory_id)

    quantities: dict[tuple[int, str | None, str | None], int] = {}
    for line in data.items:
        key = (line.product_id, line.size, line.color)
        quantities[key] = quantities.get(key, 0) + line.quantity

    product_ids = {product_id for product_id, _, _ in quantities}
    products = {
        p.id: p
        for p in db.scalars(
            _storefront_products().where(Product.factory_id == factory.id, Product.id.in_(product_ids))
        )
    }
    if product_ids - set(products):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Savatdagi ba'zi mahsulotlar endi sotuvda yo'q. Sahifani yangilab, savatni tekshiring.",
        )
    for product_id, size, color in quantities:
        _check_variant(products[product_id], size, color)

    provider = payments.get_provider()
    tg_user = telegram_service.verify_init_data(data.telegram_init_data)
    order = Order(
        factory_id=factory.id,
        public_token=secrets.token_urlsafe(32),
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        delivery_address=data.delivery_address,
        comment=data.comment,
        status=OrderStatus.PENDING_PAYMENT,
        payment_provider=provider.name,
        currency=CURRENCY,
        total_amount=Decimal("0"),
        customer_telegram_id=str(tg_user["id"]) if tg_user else None,
        customer_lang=get_lang() if tg_user else None,
    )
    total = Decimal("0")
    for (product_id, size, color), qty in quantities.items():
        product = products[product_id]
        price = Decimal(product.price)
        line_total = price * qty
        total += line_total
        order.items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                product_code=product.code,
                size=size,
                color=color,
                unit_price=price,
                quantity=qty,
                line_total=line_total,
            )
        )
    order.total_amount = total
    db.add(order)
    db.flush()
    order.order_number = f"B-{order.id:06d}"
    db.commit()

    order = _get_order_by_token(db, order.public_token)
    start = provider.start(order)
    return CheckoutResponse(
        order=_public_order(order),
        payment=PaymentInfo(provider=start.provider, test_mode=start.test_mode, checkout_url=start.checkout_url),
    )


def get_order(db: Session, token: str) -> PublicOrder:
    return _public_order(_get_order_by_token(db, token))


def _digits(value: str) -> str:
    return "".join(ch for ch in value if ch.isdigit())


def my_orders(db: Session, tokens: list[str]) -> list[PublicOrder]:
    """Mijoz brauzerida saqlangan kalitlar bo'yicha TO'LANGAN buyurtmalar (yangilari birinchi)."""
    if not tokens:
        return []
    orders = db.scalars(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.factory))
        .where(Order.public_token.in_(set(tokens)), Order.payment_status == PaymentStatus.PAID)
        .order_by(Order.paid_at.desc(), Order.id.desc())
    )
    return [_public_order(o) for o in orders]


def find_order(db: Session, order_number: str, phone: str) -> PublicOrder:
    """Buyurtma raqami + telefon bo'yicha topish. Ikkalasi mos kelmasa — bir xil 'topilmadi' javobi
    (qaysi biri noto'g'riligini aytmaymiz, aks holda raqamlarni terib tekshirish mumkin bo'lardi)."""
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.factory))
        .where(Order.order_number == order_number, Order.payment_status == PaymentStatus.PAID)
    )
    phone_digits = _digits(phone)
    if order is None or len(phone_digits) < 7 or not _digits(order.customer_phone).endswith(phone_digits[-9:]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buyurtma topilmadi. Raqam va telefonni tekshiring.")
    return _public_order(order)


def pay_demo(db: Session, token: str, card_last4: str) -> PublicOrder:
    order = _get_order_by_token(db, token)
    if order.payment_provider != payments.DemoProvider.name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Test to'lov bu buyurtma uchun mavjud emas")
    if not payments.demo_allowed():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Test to'lov o'chirilgan")
    order_service.mark_paid(
        db, order, reference=f"DEMO-{secrets.token_hex(6).upper()}", card_last4=card_last4
    )
    return get_order(db, token)
