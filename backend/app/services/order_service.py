"""Buyurtmalar: to'lovni qayd etish (CRM bilan bog'lash) va zavod xodimlari uchun boshqaruv."""

import re
import secrets
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.roles import Role
from app.core.scope import can_access
from app.models import Customer, Order, OrderItem, Product, Shipment, ShipmentItem, ShipmentStatus, User, WorkOrder
from app.models.customer import CustomerStatus, CustomerType
from app.models.audit import AuditAction
from app.models.order import OrderSource, OrderStatus, PaymentStatus
from app.models.product import ProductStatus
from app.models.production import WorkOrderStatus
from app.schemas.order import ManualOrderCreate, OrderListItem, OrderOut, OrderPage, OrderSummary, OrderUpdate
from app.services import audit_service
from app.services.customer_service import _next_code as next_customer_code
from app.core.i18n import t
from app.services import telegram_service

ORDER_VIEW_ROLES = (
    Role.SUPER_ADMIN,
    Role.FACTORY_OWNER,
    Role.MANAGER,
    Role.PRODUCTION_MANAGER,
    Role.WAREHOUSE_MANAGER,
)
ORDER_EDITOR_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER)


CLOSED_STATUSES = (OrderStatus.SHIPPED, OrderStatus.COMPLETED, OrderStatus.CANCELLED)


def _is_overdue(order: Order, today: date | None = None) -> bool:
    return order.due_date is not None and order.status not in CLOSED_STATUSES and order.due_date < (today or date.today())


def _digits(phone: str | None) -> str:
    return re.sub(r"\D", "", phone or "")


def _link_customer(db: Session, order: Order) -> None:
    """To'langan buyurtmani CRM'dagi mijozga bog'laydi (telefon bo'yicha); yo'q bo'lsa yaratadi."""
    phone = _digits(order.customer_phone)
    candidates = db.scalars(
        select(Customer).where(Customer.factory_id == order.factory_id, Customer.phone.is_not(None))
    )
    customer = next((c for c in candidates if _digits(c.phone) == phone), None)
    if customer is None:
        customer = Customer(
            factory_id=order.factory_id,
            customer_code=next_customer_code(db, order.factory_id),
            name=order.customer_name,
            customer_type=CustomerType.INDIVIDUAL,
            status=CustomerStatus.ACTIVE,
            phone=order.customer_phone,
            address=order.delivery_address,
            notes="Katalog orqali buyurtma bergan",
        )
        db.add(customer)
        db.flush()
    elif customer.status != CustomerStatus.ACTIVE:
        customer.status = CustomerStatus.ACTIVE
    order.customer_id = customer.id


def mark_paid(db: Session, order: Order, *, reference: str, card_last4: str | None) -> Order:
    """To'lov muvaffaqiyatli bo'lganda chaqiriladi (demo yoki haqiqiy provayder webhook'i)."""
    if order.payment_status == PaymentStatus.PAID:
        raise HTTPException(status.HTTP_409_CONFLICT, "Buyurtma allaqachon to'langan")
    order.payment_status = PaymentStatus.PAID
    order.status = OrderStatus.NEW
    order.payment_reference = reference
    order.card_last4 = card_last4
    order.paid_at = datetime.now(timezone.utc)
    _link_customer(db, order)
    db.commit()
    db.refresh(order)
    telegram_service.notify_new_order(db, order, "🛒 Yangi buyurtma <b>{number}</b> (katalog, to'langan)\n{customer}, {phone}\n{amount}",
                            number=order.order_number, customer=order.customer_name, phone=order.customer_phone,
                            amount=f"{float(order.total_amount):,.0f} {order.currency}".replace(",", " "))
    telegram_service.notify_customer_paid(order)
    return order


def _visible(query, actor: User):
    """Zavod faqat o'z buyurtmalarini va faqat to'langanlarini ko'radi."""
    query = query.where(Order.status != OrderStatus.PENDING_PAYMENT)
    if actor.role != Role.SUPER_ADMIN:
        query = query.where(Order.factory_id == actor.factory_id)
    return query


def _counts():
    count = select(func.count(OrderItem.id)).where(OrderItem.order_id == Order.id).correlate(Order)
    qty = (
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .where(OrderItem.order_id == Order.id)
        .correlate(Order)
    )
    return count.scalar_subquery().label("items_count"), qty.scalar_subquery().label("total_quantity")


def list_orders(
    db: Session,
    actor: User,
    *,
    search: str | None = None,
    status_: OrderStatus | None = None,
    factory_id: int | None = None,
    source: OrderSource | None = None,
    overdue: bool = False,
    offset: int = 0,
    limit: int = 25,
) -> OrderPage:
    query = _visible(select(Order), actor)
    if source is not None:
        query = query.where(Order.source == source)
    if overdue:
        query = query.where(and_(Order.due_date.is_not(None), Order.due_date < date.today(), Order.status.not_in(CLOSED_STATUSES)))
    if factory_id is not None and actor.role == Role.SUPER_ADMIN:
        query = query.where(Order.factory_id == factory_id)
    if status_ is not None:
        query = query.where(Order.status == status_)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Order.order_number.ilike(pattern),
                Order.customer_name.ilike(pattern),
                Order.customer_phone.ilike(pattern),
            )
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items_count, total_quantity = _counts()
    rows = db.execute(
        query.add_columns(items_count, total_quantity)
        .options(selectinload(Order.factory))
        .order_by(func.coalesce(Order.paid_at, Order.created_at).desc(), Order.id.desc())
        .offset(offset)
        .limit(limit)
    )
    items = []
    for order, count, qty in rows:
        item = OrderListItem.model_validate(order)
        item.items_count = count or 0
        item.total_quantity = qty or 0
        item.is_overdue = _is_overdue(order)
        items.append(item)
    return OrderPage(items=items, total=total)


def summary(db: Session, actor: User) -> OrderSummary:
    query = _visible(select(Order.status, func.count()), actor).group_by(Order.status)
    by_status = {s.value: 0 for s in OrderStatus if s != OrderStatus.PENDING_PAYMENT}
    for status_value, count in db.execute(query):
        by_status[OrderStatus(status_value).value] = count
    return OrderSummary(new_count=by_status[OrderStatus.NEW.value], by_status=by_status)


def _get(db: Session, actor: User, order_id: int) -> Order:
    order = db.scalar(
        _visible(
            select(Order)
            .options(
                selectinload(Order.items),
                selectinload(Order.factory),
                selectinload(Order.customer),
            )
            .where(Order.id == order_id),
            actor,
        )
    )
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Buyurtma topilmadi")
    return order


def _to_out(order: Order) -> OrderOut:
    out = OrderOut.model_validate(order)
    out.items_count = len(order.items)
    out.total_quantity = sum(i.quantity for i in order.items)
    out.is_overdue = _is_overdue(order)
    return out


def get_order(db: Session, actor: User, order_id: int) -> OrderOut:
    return _to_out(_get(db, actor, order_id))


def change_status(db: Session, actor: User, order: Order, new: OrderStatus, why: str) -> None:
    """Boshqa modullar (ishlab chiqarish, jo'natma) buyurtma holatini avtomatik o'zgartiradi — audit bilan, commit'siz."""
    audit_service.record(db, actor, entity="order", entity_id=order.id, action=AuditAction.STATUS,
                         summary=f"Buyurtma {order.order_number}: {order.status.value} → {new.value} ({why})",
                         factory_id=order.factory_id, changes={"status": [order.status.value, new.value]})
    telegram_service.queue_customer_status(db, order, new)
    order.status = new


MANUAL_FLOW = (
    OrderStatus.NEW,
    OrderStatus.CONFIRMED,
    OrderStatus.IN_PRODUCTION,
    OrderStatus.READY,
    OrderStatus.SHIPPED,
    OrderStatus.COMPLETED,
)


def _shipment_states(db: Session, order_id: int) -> set[ShipmentStatus]:
    return set(db.scalars(select(Shipment.status).where(Shipment.order_id == order_id).distinct()))


def complete_if_done(db: Session, actor: User, order: Order) -> None:
    """Jo'natilgan + hamma jo'natmalar yetkazilgan + to'langan → "Yakunlandi" (commit'siz).
    Yetkazish ham, to'lov ham oxirgi bo'lishi mumkin — ikkala joydan chaqiriladi."""
    if order.status != OrderStatus.SHIPPED or order.payment_status != PaymentStatus.PAID:
        return
    states = _shipment_states(db, order.id) - {ShipmentStatus.CANCELLED}
    if ShipmentStatus.DELIVERED in states and not states & {ShipmentStatus.PREPARING, ShipmentStatus.SHIPPED}:
        change_status(db, actor, order, OrderStatus.COMPLETED, "hammasi yetkazildi va to'langan")


def _cancel_related(db: Session, actor: User, order: Order) -> None:
    """Bekor qilinganda: mahsulot jo'natilgan bo'lsa — taqiqlanadi; ochiq ish buyurtmalari va
    tayyorlanayotgan jo'natmalar ham bekor qilinadi (bekor buyurtmaga ishlab chiqarish davom etmasin)."""
    states = _shipment_states(db, order.id)
    if states & {ShipmentStatus.SHIPPED, ShipmentStatus.DELIVERED}:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Mahsulot mijozga jo'natilgan — buyurtmani bekor qilib bo'lmaydi. Qaytgan mahsulotni «Mijozdan qaytdi» orqali kiriting",
        )
    now = datetime.now(timezone.utc)
    for wo in db.scalars(select(WorkOrder).where(WorkOrder.order_id == order.id, WorkOrder.status.in_((WorkOrderStatus.PLANNED, WorkOrderStatus.IN_PROGRESS)))):
        wo.status, wo.completed_at = WorkOrderStatus.CANCELLED, now
        audit_service.record(db, actor, entity="work_order", entity_id=wo.id, action=AuditAction.STATUS,
                             summary=f"Ish buyurtmasi {wo.number}: CANCELLED (buyurtma {order.order_number} bekor qilindi)", factory_id=order.factory_id)
    for sh in db.scalars(select(Shipment).where(Shipment.order_id == order.id, Shipment.status == ShipmentStatus.PREPARING)):
        sh.status = ShipmentStatus.CANCELLED
        audit_service.record(db, actor, entity="shipment", entity_id=sh.id, action=AuditAction.STATUS,
                             summary=f"Jo'natma {sh.number}: bekor qilindi (buyurtma {order.order_number} bekor qilindi)", factory_id=order.factory_id)


def update_status(db: Session, actor: User, order_id: int, new_status: OrderStatus) -> OrderOut:
    order = _get(db, actor, order_id)
    if new_status == OrderStatus.PENDING_PAYMENT:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bu statusni qo'lda qo'yib bo'lmaydi")
    if order.status in (OrderStatus.COMPLETED, OrderStatus.CANCELLED) and new_status != order.status:
        raise HTTPException(status.HTTP_409_CONFLICT, "Yakunlangan yoki bekor qilingan buyurtmani o'zgartirib bo'lmaydi")
    if new_status == order.status:
        return get_order(db, actor, order.id)
    if new_status == OrderStatus.CANCELLED:
        _cancel_related(db, actor, order)
    else:
        if order.status in MANUAL_FLOW and MANUAL_FLOW.index(new_status) < MANUAL_FLOW.index(order.status):
            raise HTTPException(status.HTTP_409_CONFLICT, "Buyurtma holatini orqaga qaytarib bo'lmaydi")
        states = _shipment_states(db, order.id)
        if new_status in (OrderStatus.SHIPPED, OrderStatus.COMPLETED) and ShipmentStatus.PREPARING in states:
            raise HTTPException(status.HTTP_409_CONFLICT, "Tayyorlanayotgan jo'natma bor — avval uni yo'lga chiqaring yoki bekor qiling")
        if new_status == OrderStatus.COMPLETED and ShipmentStatus.SHIPPED in states:
            raise HTTPException(status.HTTP_409_CONFLICT, "Yo'ldagi jo'natma hali yetkazilmagan — avval «Yetkazildi» deb belgilang")
    audit_service.record(
        db, actor, entity="order", entity_id=order.id, action=AuditAction.STATUS,
        summary=f"Buyurtma {order.order_number}: {order.status.value} → {new_status.value}",
        factory_id=order.factory_id, changes={"status": [order.status.value, new_status.value]},
    )
    telegram_service.queue_customer_status(db, order, new_status)
    order.status = new_status
    db.commit()
    return get_order(db, actor, order.id)


def _check_variant(product: Product, size: str | None, color: str | None) -> None:
    for value, options, label in ((size, product.sizes, "o'lcham"), (color, product.colors, "rang")):
        if options and value not in options:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                t("«{product}» uchun {label}ni tanlang", product=product.name, label=t(label)) if value is None else t("«{product}» uchun bunday {label} yo'q: {value}", product=product.name, label=t(label), value=value),
            )
        if not options and value is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("«{product}» uchun {label} tanlanmaydi", product=product.name, label=t(label)))


def create_manual_order(db: Session, actor: User, data: ManualOrderCreate) -> OrderOut:
    """Menejer CRM'dagi mijoz uchun buyurtma kiritadi. Zavod — mijozning zavodi (qayta tanlanmaydi)."""
    customer = db.get(Customer, data.customer_id)
    if customer is None or not can_access(actor, customer.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mijoz topilmadi")
    if data.due_date is not None and data.due_date < date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Topshirish muddati o'tgan sana bo'lmasin")

    product_ids = {line.product_id for line in data.items}
    products = {
        p.id: p
        for p in db.scalars(select(Product).where(Product.id.in_(product_ids), Product.factory_id == customer.factory_id))
    }
    if product_ids - products.keys():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Mahsulot topilmadi (boshqa zavodniki yoki o'chirilgan)")

    order = Order(
        factory_id=customer.factory_id,
        customer_id=customer.id,
        public_token=secrets.token_urlsafe(32),
        customer_name=customer.name,
        customer_phone=customer.phone or "",
        delivery_address=data.delivery_address or customer.address,
        comment=data.comment,
        status=OrderStatus.NEW,
        payment_status=PaymentStatus.PENDING,
        payment_provider="manual",
        currency="UZS",
        total_amount=Decimal("0"),
        source=OrderSource.MANUAL,
        due_date=data.due_date,
        created_by_id=actor.id,
    )
    total = Decimal("0")
    for line in data.items:
        product = products[line.product_id]
        if product.status == ProductStatus.ARCHIVED:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("«{product}» arxivlangan", product=product.name))
        _check_variant(product, line.size, line.color)
        price = Decimal(str(line.unit_price)) if line.unit_price is not None else product.price
        if price is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, t("«{product}» uchun narx kiriting", product=product.name))
        price = Decimal(price).quantize(Decimal("0.01"))
        line_total = price * line.quantity
        total += line_total
        order.items.append(
            OrderItem(
                product_id=product.id, product_name=product.name, product_code=product.code,
                size=line.size, color=line.color, unit_price=price, quantity=line.quantity, line_total=line_total,
            )
        )
    order.total_amount = total
    db.add(order)
    db.flush()
    order.order_number = f"B-{order.id:06d}"
    audit_service.record(
        db, actor, entity="order", entity_id=order.id, action=AuditAction.CREATE,
        summary=f"Buyurtma {order.order_number} kiritildi: {customer.name}, {len(order.items)} qator",
        factory_id=order.factory_id,
    )
    db.commit()
    telegram_service.notify_new_order(db, order, "📝 Yangi buyurtma <b>{number}</b> kiritildi\n{customer} · {amount}\nKiritdi: {user}",
                            number=order.order_number, customer=customer.name, user=actor.full_name,
                            amount=f"{float(order.total_amount):,.0f} {order.currency}".replace(",", " "))
    return get_order(db, actor, order.id)


def update_order(db: Session, actor: User, order_id: int, data: OrderUpdate) -> OrderOut:
    order = _get(db, actor, order_id)
    values = data.model_dump(exclude_unset=True)
    changes = audit_service.diff(order, values)
    for field, value in values.items():
        setattr(order, field, value)
    if changes:
        audit_service.record(
            db, actor, entity="order", entity_id=order.id, action=AuditAction.UPDATE,
            summary=f"Buyurtma {order.order_number} o'zgartirildi", factory_id=order.factory_id, changes=changes,
        )
    db.commit()
    return get_order(db, actor, order.id)


def record_manual_payment(db: Session, actor: User, order_id: int) -> OrderOut:
    """Qo'lda kiritilgan buyurtma uchun to'lov (bank o'tkazmasi, naqd) qabul qilinganini qayd etish."""
    order = _get(db, actor, order_id)
    if order.status == OrderStatus.CANCELLED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Bekor qilingan buyurtmaga to'lov qayd etilmaydi")
    if order.source != OrderSource.MANUAL:
        raise HTTPException(status.HTTP_409_CONFLICT, "Katalog buyurtmasining to'lovi karta orqali qayd etiladi")
    if order.payment_status == PaymentStatus.PAID:
        raise HTTPException(status.HTTP_409_CONFLICT, "Buyurtma allaqachon to'langan")
    order.payment_status = PaymentStatus.PAID
    order.paid_at = datetime.now(timezone.utc)
    audit_service.record(
        db, actor, entity="order", entity_id=order.id, action=AuditAction.UPDATE,
        summary=f"Buyurtma {order.order_number}: to'lov qabul qilindi", factory_id=order.factory_id,
        changes={"payment_status": ["PENDING", "PAID"]},
    )
    complete_if_done(db, actor, order)
    db.commit()
    return get_order(db, actor, order.id)
