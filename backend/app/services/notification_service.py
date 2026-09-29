"""Bildirishnomalar: mavjud ma'lumotlardan hisoblanadigan ogohlantirishlar (alohida saqlanmaydi).

Har biri barqaror kalitga ega (masalan "late-wo:12") — foydalanuvchi o'qiganda faqat kalit saqlanadi.
Holat qayta paydo bo'lsa (masalan, keyingi texnik xizmat muddati) — kalit yangi bo'ladi.
Chegaralar fabrika sozlamalaridan olinadi (costing_service.settings_for).
"""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.i18n import t
from app.core.scope import scoped
from app.models import Device, DeviceEvent, Machine, NotificationRead, Order, ProductionLog, PurchaseOrder, Shipment, ShipmentStatus, User, VisionRule, WorkOrder
from app.models.order import OrderStatus
from app.models.resources import MachineStatus
from app.models.vision import EventStatus
from app.schemas.analytics import Notification, NotificationList
from app.services import (
    costing_service,
    inventory_service,
    logistics_service,
    machine_service,
    order_service,
    procurement_service,
    production_service,
    vision_service,
)

PER_TYPE = 20
READ_RETENTION_DAYS = 120


def _orders(db: Session, actor: User, today: date) -> list[Notification]:
    out = []
    base = order_service._visible(select(Order), actor)
    overdue = db.scalars(base.where(Order.due_date < today, Order.status.not_in(order_service.CLOSED_STATUSES)).order_by(Order.due_date).limit(PER_TYPE))
    for o in overdue:
        out.append(Notification(key=f"overdue-order:{o.id}", type="order", severity="error", title=t("Buyurtma {number} kechikmoqda", number=o.order_number),
                                message=t("{customer} · muddat {date}", customer=o.customer_name, date=o.due_date.strftime('%d.%m.%Y')), path=f"/orders/{o.id}", at=o.due_date))
    fresh = db.scalars(base.where(Order.status == OrderStatus.NEW).order_by(Order.created_at.desc()).limit(PER_TYPE))
    for o in fresh:
        out.append(Notification(key=f"new-order:{o.id}", type="order", severity="info", title=t("Yangi buyurtma {number}", number=o.order_number),
                                message=f"{o.customer_name} · {float(o.total_amount):,.0f} {o.currency}".replace(",", " "), path=f"/orders/{o.id}", at=o.created_at))
    return out


def _low_margin(db: Session, actor: User) -> list[Notification]:
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=30)
    orders = list(db.scalars(order_service._visible(select(Order), actor).where(
        Order.status.in_((OrderStatus.READY, OrderStatus.SHIPPED, OrderStatus.COMPLETED)), Order.updated_at >= since,
    ).limit(50)))
    out = []
    for o, c in zip(orders, costing_service.orders_costing(db, orders)):
        if c.low_margin:
            out.append(Notification(key=f"low-margin:{o.id}", type="costing", severity="warning", title=t("{number}: foyda past", number=o.order_number),
                                    message=t("Foyda {margin}% (tannarx {cost})", margin=c.margin_pct, cost=f"{c.total_cost:,.0f}".replace(",", " ")), path=f"/orders/{o.id}"))
    return out[:PER_TYPE]


def _production(db: Session, actor: User, today: date) -> list[Notification]:
    out = []
    open_wo = scoped(select(WorkOrder), actor, WorkOrder.factory_id).where(WorkOrder.status.in_(production_service.OPEN))
    for wo in db.scalars(open_wo.where(WorkOrder.planned_end < today).order_by(WorkOrder.planned_end).limit(PER_TYPE)):
        out.append(Notification(key=f"late-wo:{wo.id}", type="production", severity="warning", title=t("{number} kechikmoqda", number=wo.number),
                                message=t("{product} × {qty} · reja {date}", product=wo.product_name, qty=wo.quantity, date=wo.planned_end.strftime('%d.%m.%Y')), path=f"/production/{wo.id}", at=wo.planned_end))
    rows = db.execute(
        select(WorkOrder, func.sum(ProductionLog.quantity_good), func.sum(ProductionLog.quantity_defect))
        .join(ProductionLog, ProductionLog.work_order_id == WorkOrder.id)
        .where(WorkOrder.id.in_(open_wo.with_only_columns(WorkOrder.id).scalar_subquery()))
        .group_by(WorkOrder.id)
    ).all()
    limits = {}
    for wo, good, bad in rows:
        good, bad = int(good or 0), int(bad or 0)
        if not bad:
            continue
        limit = limits.setdefault(wo.factory_id, float(costing_service.settings_for(db, wo.factory_id).defect_alert_percent))
        rate = bad / (good + bad) * 100
        if rate > limit:
            out.append(Notification(key=f"defect-wo:{wo.id}", type="quality", severity="warning", title=t("{number}: brak {rate}%", number=wo.number, rate=f"{rate:.1f}"),
                                    message=t("Chegara {limit}% · {bad} dona brak", limit=f"{limit:g}", bad=bad), path=f"/production/{wo.id}"))
    return out


def _procurement(db: Session, actor: User, today: date) -> list[Notification]:
    q = scoped(select(PurchaseOrder), actor, PurchaseOrder.factory_id).where(
        PurchaseOrder.status.in_(procurement_service.OPEN), PurchaseOrder.expected_date < today
    ).order_by(PurchaseOrder.expected_date).limit(PER_TYPE)
    return [
        Notification(key=f"overdue-po:{po.id}", type="procurement", severity="warning", title=t("Xarid {number} kechikmoqda", number=po.number),
                     message=t("Kutilgan sana {date}", date=po.expected_date.strftime('%d.%m.%Y')), path=f"/purchases/{po.id}", at=po.expected_date)
        for po in db.scalars(q)
    ]


def _inventory(db: Session, actor: User) -> list[Notification]:
    page = inventory_service.list_materials(db, actor, stock_state="low", limit=PER_TYPE)
    return [
        Notification(key=f"low-stock:{m.id}", type="inventory", severity="error" if m.stock <= 0 else "warning",
                     title=t("{code}: tugadi" if m.stock <= 0 else "{code}: kam qoldi", code=m.code), message=t("{name} · qoldiq {stock}, minimum {min}", name=m.name, stock=f"{m.stock:g}", min=f"{float(m.min_stock):g}"),
                     path=f"/inventory/materials/{m.id}")
        for m in page.items
    ]


def _logistics(db: Session, actor: User, today: date) -> list[Notification]:
    q = scoped(select(Shipment), actor, Shipment.factory_id).where(
        Shipment.status == ShipmentStatus.PREPARING, Shipment.planned_date < today
    ).order_by(Shipment.planned_date).limit(PER_TYPE)
    return [
        Notification(key=f"late-shipment:{sh.id}", type="logistics", severity="warning", title=t("Jo'natma {number} kechikmoqda", number=sh.number),
                     message=t("Reja {date} — hali yo'lga chiqmagan", date=sh.planned_date.strftime('%d.%m.%Y')), path=f"/shipments/{sh.id}", at=sh.planned_date)
        for sh in db.scalars(q)
    ]


def _machines(db: Session, actor: User, today: date) -> list[Notification]:
    out = []
    machines = db.scalars(scoped(select(Machine), actor, Machine.factory_id).where(Machine.is_active.is_(True)))
    for m in machines:
        if m.status == MachineStatus.BROKEN:
            out.append(Notification(key=f"machine-broken:{m.id}", type="machine", severity="error", title=t("{code} buzilgan", code=m.code),
                                    message=m.name, path=f"/machines/{m.id}"))
        nxt = machine_service.next_maintenance(m)
        if nxt is not None and nxt < today:
            out.append(Notification(key=f"maintenance:{m.id}:{nxt.isoformat()}", type="machine", severity="warning",
                                    title=t("{code}: texnik xizmat muddati o'tdi", code=m.code), message=f"{m.name} · {nxt.strftime('%d.%m.%Y')}", path=f"/machines/{m.id}", at=nxt))
    return out[: PER_TYPE * 2]


def _vision(db: Session, actor: User) -> list[Notification]:
    """Kamera/AI: tasdiqlash kutilayotgan hodisalar, aloqasi uzilgan qurilmalar, qoida chegarasidan oshish."""
    out = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    pending = db.execute(scoped(select(func.count(), func.max(DeviceEvent.id)), actor, DeviceEvent.factory_id)
                         .where(DeviceEvent.status == EventStatus.PENDING)).one()
    if pending[0]:
        out.append(Notification(key=f"vision-pending:{pending[1]}", type="vision", severity="info",
                                title=t("{count} ta AI hodisasi tasdiqlashni kutmoqda", count=pending[0]), message=t("Kamera/sensor hodisalarini ko'rib chiqing"),
                                path="/vision/events"))
    offline_after = now - timedelta(minutes=30)
    for d in db.scalars(scoped(select(Device), actor, Device.factory_id).where(Device.is_active.is_(True), Device.last_seen_at.is_not(None))):
        seen = d.last_seen_at.replace(tzinfo=None) if d.last_seen_at.tzinfo is None else d.last_seen_at.astimezone(timezone.utc).replace(tzinfo=None)
        if seen < offline_after:
            out.append(Notification(key=f"device-offline:{d.id}:{seen.isoformat(timespec='minutes')}", type="vision", severity="warning",
                                    title=t("{code}: aloqa yo'q", code=d.code), message=t("{name} · oxirgi aloqa {seen} (UTC)", name=d.name, seen=seen.strftime('%d.%m %H:%M')), path="/vision"))
    rules = db.scalars(scoped(select(VisionRule), actor, VisionRule.factory_id).where(
        VisionRule.is_active.is_(True), VisionRule.alert_threshold.is_not(None), VisionRule.alert_window_minutes.is_not(None)))
    for r in rules:
        since = now - timedelta(minutes=r.alert_window_minutes)
        q = select(func.coalesce(func.sum(func.coalesce(DeviceEvent.quantity, 1)), 0)).where(
            DeviceEvent.factory_id == r.factory_id, DeviceEvent.event_type == r.event_type, DeviceEvent.occurred_at >= since)
        if r.device_id:
            q = q.where(DeviceEvent.device_id == r.device_id)
        total = int(db.scalar(q) or 0)
        if total >= r.alert_threshold:
            bucket = int(now.timestamp() // (r.alert_window_minutes * 60))
            out.append(Notification(key=f"vision-alert:{r.id}:{bucket}", type="vision", severity="error",
                                    title=f"AI: {r.event_type.value} {total} ta / {r.alert_window_minutes} daqiqa",
                                    message=f"Chegara {r.alert_threshold}" + (f" · qurilma {r.device.code}" if r.device else ""), path="/vision/events"))
    return out[:PER_TYPE]


def collect(db: Session, actor: User) -> list[Notification]:
    """Rolga qarab: har bir ogohlantirish faqat o'sha modulni ko'ra oladiganlarga."""
    today = date.today()
    role = actor.role
    items: list[Notification] = []
    if role in order_service.ORDER_VIEW_ROLES:
        items += _orders(db, actor, today)
    if role in costing_service.FINANCE_ROLES:
        items += _low_margin(db, actor)
    if role in production_service.PRODUCTION_VIEW_ROLES:
        items += _production(db, actor, today)
    if role in procurement_service.PROCUREMENT_VIEW_ROLES:
        items += _procurement(db, actor, today)
    if role in inventory_service.INVENTORY_VIEW_ROLES:
        items += _inventory(db, actor)
    if role in logistics_service.LOGISTICS_VIEW_ROLES:
        items += _logistics(db, actor, today)
    if role in machine_service.MACHINE_VIEW_ROLES:
        items += _machines(db, actor, today)
    if role in vision_service.VISION_VIEW_ROLES:
        items += _vision(db, actor)
    return items


def list_for(db: Session, actor: User) -> NotificationList:
    items = collect(db, actor)
    keys = [n.key for n in items]
    read = set(db.scalars(select(NotificationRead.key).where(NotificationRead.user_id == actor.id, NotificationRead.key.in_(keys)))) if keys else set()
    order = {"error": 0, "warning": 1, "info": 2}
    for n in items:
        n.read = n.key in read
    items.sort(key=lambda n: (n.read, order[n.severity]))
    return NotificationList(items=items, unread=sum(1 for n in items if not n.read))


def mark_read(db: Session, actor: User, keys: list[str] | None = None) -> NotificationList:
    """keys=None — hammasi o'qildi."""
    wanted = set(keys) if keys is not None else {n.key for n in collect(db, actor)}
    existing = set(db.scalars(select(NotificationRead.key).where(NotificationRead.user_id == actor.id, NotificationRead.key.in_(wanted)))) if wanted else set()
    for key in sorted(wanted - existing):
        if len(key) <= 120:
            db.add(NotificationRead(user_id=actor.id, key=key))
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=READ_RETENTION_DAYS)
    db.execute(delete(NotificationRead).where(NotificationRead.user_id == actor.id, NotificationRead.read_at < cutoff))
    db.commit()
    return list_for(db, actor)

