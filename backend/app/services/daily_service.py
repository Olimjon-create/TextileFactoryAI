"""Kunlik vazifa (Vercel Cron, har kuni kechqurun):

  - bazaga murojaat — Supabase bepul loyihasi 7 kun faolsiz qolsa to'xtatiladi, bu uni uyg'oq saqlaydi;
  - eskirgan yozuvlarni tozalash (so'rovlar hisoblagichi, ishlatilgan/eskirgan parol tokenlari);
  - Telegram ulangan har bir zavodga kunlik hisobot (zavod tanlagan tilda).
"""

import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.i18n import MONTHS_FULL
from app.models import Factory, LeaveRequest, Machine, Material, Order, PasswordResetToken, RateLimitHit, StockMovement, WorkOrder
from app.models.attendance import LeaveStatus
from app.models.order import OrderStatus
from app.models.production import WorkOrderStatus
from app.models.resources import MachineStatus
from app.services import backup_service, telegram_service

TASHKENT = timezone(timedelta(hours=5))
OPEN_ORDER = (OrderStatus.NEW, OrderStatus.CONFIRMED, OrderStatus.IN_PRODUCTION, OrderStatus.READY)

REPORT = (
    "📊 <b>Kunlik hisobot</b> · {factory}\n{day}\n\n"
    "🛒 Bugungi buyurtmalar: {orders} ta · {amount}\n"
    "📋 Ochiq buyurtmalar: {open} ta (muddati o'tgan: {overdue})\n"
    "🏭 Bugun tugallangan ish buyurtmalari: {wo_done} ta · {wo_qty} dona\n"
    "⚠️ Kam qolgan materiallar: {low}\n"
    "🔧 Buzilgan dastgohlar: {broken}\n"
    "🙋 Ko'rib chiqilmagan javob so'rovlari: {leaves}"
)


def _today_window(now: datetime | None = None) -> tuple[date, datetime, datetime]:
    local = (now or datetime.now(timezone.utc)).astimezone(TASHKENT)
    start = datetime(local.year, local.month, local.day, tzinfo=TASHKENT)
    return local.date(), start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def _count(db: Session, query) -> int:
    return int(db.scalar(select(func.count()).select_from(query.subquery())) or 0)


def factory_report(db: Session, factory: Factory, now: datetime | None = None) -> dict:
    today, start, end = _today_window(now)
    fid = factory.id
    placed = func.coalesce(Order.paid_at, Order.created_at)
    orders_today = select(Order.total_amount).where(
        Order.factory_id == fid, Order.status.not_in((OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED)),
        placed >= start, placed < end,
    )
    amount = Decimal(db.scalar(select(func.coalesce(func.sum(orders_today.subquery().c.total_amount), 0))) or 0)
    open_orders = select(Order.id).where(Order.factory_id == fid, Order.status.in_(OPEN_ORDER))
    stock = (
        select(func.coalesce(func.sum(StockMovement.quantity), 0))
        .where(StockMovement.material_id == Material.id)
        .scalar_subquery()
    )
    done = db.execute(
        select(func.count(WorkOrder.id), func.coalesce(func.sum(WorkOrder.quantity), 0)).where(
            WorkOrder.factory_id == fid, WorkOrder.status == WorkOrderStatus.COMPLETED,
            WorkOrder.completed_at >= start, WorkOrder.completed_at < end,
        )
    ).one()
    return {
        "day": today,
        "orders": _count(db, orders_today),
        "amount": amount,
        "open": _count(db, open_orders),
        "overdue": _count(db, open_orders.where(Order.due_date < today)),
        "wo_done": int(done[0]),
        "wo_qty": int(done[1]),
        "low": _count(db, select(Material.id).where(
            Material.factory_id == fid, Material.is_active.is_(True), Material.min_stock > 0, stock <= Material.min_stock)),
        "broken": _count(db, select(Machine.id).where(
            Machine.factory_id == fid, Machine.is_active.is_(True), Machine.status == MachineStatus.BROKEN)),
        "leaves": _count(db, select(LeaveRequest.id).where(
            LeaveRequest.factory_id == fid, LeaveRequest.status == LeaveStatus.PENDING)),
    }


UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]


def _day_label(day: date, lang: str) -> str:
    return f"{day.day} {MONTHS_FULL.get(lang, UZ_MONTHS)[day.month - 1]} {day.year}"


def send_reports(db: Session, now: datetime | None = None) -> int:
    sent = 0
    factories = db.scalars(select(Factory).where(Factory.is_active.is_(True), Factory.telegram_chat_id.is_not(None)))
    for factory in factories:
        r = factory_report(db, factory, now)
        lang = factory.telegram_lang or "uz"
        ok = telegram_service.send(
            factory, REPORT, factory=factory.name, day=_day_label(r["day"], lang),
            orders=r["orders"], amount=f"{float(r['amount']):,.0f} UZS".replace(",", " "),
            open=r["open"], overdue=r["overdue"], wo_done=r["wo_done"], wo_qty=r["wo_qty"],
            low=r["low"], broken=r["broken"], leaves=r["leaves"],
        )
        sent += int(ok)
    return sent


def cleanup(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    hits = db.execute(delete(RateLimitHit).where(RateLimitHit.window_start < int(time.time()) - 2 * 86400)).rowcount
    tokens = db.execute(delete(PasswordResetToken).where(PasswordResetToken.expires_at < now - timedelta(days=7))).rowcount
    db.commit()
    return {"rate_limit_hits": hits or 0, "reset_tokens": tokens or 0}


def send_employee_reports(db: Session, now: datetime | None = None) -> int:
    from app.models import Attendance, Employee, ProductionLog
    from app.models.resources import EmployeeStatus

    if not telegram_service.settings.telegram_enabled:
        return 0
    today, _, _ = _today_window(now)
    active_today = select(ProductionLog.employee_id).where(ProductionLog.work_date == today).union(
        select(Attendance.employee_id).where(Attendance.work_date == today)
    )
    employees = db.scalars(select(Employee).where(
        Employee.telegram_chat_id.is_not(None), Employee.status == EmployeeStatus.ACTIVE, Employee.id.in_(active_today)
    ))
    sent = 0
    for employee in employees:
        lang = employee.telegram_lang or "uz"
        text = telegram_service.t_lang(lang, "🌙 Kunlik hisobot") + "\n\n" + telegram_service.employee_summary_text(db, employee, lang)
        try:
            telegram_service._call("sendMessage", timeout=5, chat_id=employee.telegram_chat_id, text=text, parse_mode="HTML")
            sent += 1
        except Exception as exc:
            print("employee report:", exc)
    return sent


def run(db: Session) -> dict:
    result = {"cleanup": cleanup(db)}
    result["reports_sent"] = send_reports(db)
    result["employee_reports"] = send_employee_reports(db)
    try:
        result["backup"] = backup_service.cloud_backup(db.get_bind())
    except Exception as exc:
        result["backup"] = {"error": str(exc)[:300]}
        telegram_service.alert_admin("CRON", "daily backup", exc)
    return result
