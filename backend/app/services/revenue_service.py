"""Tushum statistikasi: to'langan buyurtmalar kunlik / haftalik / oylik / yillik kesimda.

Hisob zavodning mahalliy vaqtida (settings.TIMEZONE_OFFSET_HOURS) — kechki 23:30 dagi to'lov
UTC bo'yicha emas, Toshkent bo'yicha o'sha kunga tushadi. Har bir davr oldingi xuddi shunday
uzunlikdagi davr bilan solishtiriladi (masalan, oxirgi 12 oy — undan oldingi 12 oy).
"""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import i18n
from app.core.config import settings
from app.core.i18n import get_lang, t
from app.core.roles import Role
from app.models import Factory, Order, User
from app.models.order import PaymentStatus
from app.schemas.revenue import FactoryRevenue, RevenueBucket, RevenueOut, RevenuePeriod, RevenueQuick
from app.services import order_service

MONTHS = ["Yan", "Fev", "Mar", "Apr", "May", "Iyun", "Iyul", "Avg", "Sen", "Okt", "Noy", "Dek"]
MONTHS_FULL = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"]

# Nechta ustun ko'rsatiladi
BUCKETS: dict[str, int] = {"day": 30, "week": 12, "month": 12, "year": 5}


def _tz() -> timezone:
    return timezone(timedelta(hours=settings.TIMEZONE_OFFSET_HOURS))


def _today() -> date:
    return datetime.now(_tz()).date()


def _local_date(stamp: datetime) -> date:
    # SQLite vaqtni tz'siz qaytaradi — bazada UTC saqlanadi
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(_tz()).date()


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def _bucket_start(d: date, period: str) -> date:
    if period == "day":
        return d
    if period == "week":
        return d - timedelta(days=d.weekday())  # dushanba
    if period == "month":
        return d.replace(day=1)
    return date(d.year, 1, 1)


def _next(start: date, period: str, n: int = 1) -> date:
    if period == "day":
        return start + timedelta(days=n)
    if period == "week":
        return start + timedelta(weeks=n)
    if period == "month":
        return _add_months(start, n)
    return date(start.year + n, 1, 1)


def _label(start: date, period: str) -> tuple[str, str]:
    """(qisqa yozuv o'q uchun, to'liq yozuv maslahat uchun) — so'rov tilida (app.core.i18n)"""
    lang = get_lang()
    months = i18n.MONTHS.get(lang, MONTHS)
    m = start.month - 1
    if period == "day":
        if lang == "uz":
            full = f"{start.day}-{MONTHS_FULL[m]} {start.year}"
        elif lang == "ru":
            full = f"{start.day} {i18n.MONTHS_FULL['ru'][m]} {start.year}"
        else:
            full = f"{start.day} {i18n.MONTHS_FULL['en'][m]} {start.year}"
        return f"{start.day:02d}.{start.month:02d}", full
    if period == "week":
        end = start + timedelta(days=6)
        return f"{start.day:02d}.{start.month:02d}", f"{start.day:02d}.{start.month:02d} – {end.day:02d}.{end.month:02d}.{end.year}"
    if period == "month":
        full = MONTHS_FULL[m].capitalize() if lang == "uz" else i18n.MONTHS_NOMINATIVE[lang][m]
        return months[m], f"{full} {start.year}"
    return str(start.year), t("{year}-yil", year=start.year)


def _orders_query(actor: User, factory_id: int | None):
    q = order_service._visible(select(Order.paid_at, Order.total_amount, Order.factory_id), actor).where(
        Order.payment_status == PaymentStatus.PAID, Order.paid_at.is_not(None)
    )
    if factory_id is not None and actor.role == Role.SUPER_ADMIN:
        q = q.where(Order.factory_id == factory_id)
    return q


def revenue(db: Session, actor: User, period: RevenuePeriod = "day", factory_id: int | None = None) -> RevenueOut:
    today = _today()
    count = BUCKETS[period]
    last = _bucket_start(today, period)
    first = _next(last, period, -(count - 1))
    prev_first = _next(first, period, -count)
    # Tezkor ko'rsatkichlar uchun eng uzoq sana — joriy yil boshi
    since = min(prev_first, date(today.year, 1, 1), _bucket_start(today, "week"))
    since_utc = datetime.combine(since, datetime.min.time(), tzinfo=_tz()).astimezone(timezone.utc).replace(tzinfo=None)

    starts = [_next(first, period, i) for i in range(count)]
    sums: dict[date, float] = defaultdict(float)
    counts: dict[date, int] = defaultdict(int)
    prev_total, prev_orders = 0.0, 0
    quick = RevenueQuick()
    week_start, month_start, year_start = _bucket_start(today, "week"), today.replace(day=1), date(today.year, 1, 1)
    per_factory: dict[int, list[float]] = defaultdict(lambda: [0.0, 0])

    for paid_at, amount, fid in db.execute(_orders_query(actor, factory_id).where(Order.paid_at >= since_utc)):
        d = _local_date(paid_at)
        amount = float(amount)
        if d == today:
            quick.today += amount
        if d >= week_start:
            quick.week += amount
        if d >= month_start:
            quick.month += amount
        if d >= year_start:
            quick.year += amount
        if first <= d <= today:
            b = _bucket_start(d, period)
            sums[b] += amount
            counts[b] += 1
            per_factory[fid][0] += amount
            per_factory[fid][1] += 1
        elif prev_first <= d < first:
            prev_total += amount
            prev_orders += 1

    buckets = []
    for s in starts:
        short, full = _label(s, period)
        buckets.append(
            RevenueBucket(
                start=s, end=min(_next(s, period) - timedelta(days=1), today), label=short, full_label=full,
                revenue=round(sums.get(s, 0.0), 2), orders=counts.get(s, 0), current=s == last,
            )
        )
    total = round(sum(b.revenue for b in buckets), 2)
    orders = sum(b.orders for b in buckets)
    best = max(buckets, key=lambda b: b.revenue) if orders else None

    by_factory: list[FactoryRevenue] = []
    if actor.role == Role.SUPER_ADMIN and factory_id is None and per_factory:
        names = dict(db.execute(select(Factory.id, Factory.name).where(Factory.id.in_(list(per_factory.keys())))).all())
        by_factory = sorted(
            (FactoryRevenue(factory_id=fid, name=names.get(fid, "—"), revenue=round(v[0], 2), orders=int(v[1])) for fid, v in per_factory.items()),
            key=lambda f: f.revenue,
            reverse=True,
        )[:8]

    for k in ("today", "week", "month", "year"):
        setattr(quick, k, round(getattr(quick, k), 2))

    return RevenueOut(
        period=period,
        date_from=first,
        date_to=today,
        buckets=buckets,
        total=total,
        orders=orders,
        average_order=round(total / orders, 2) if orders else 0,
        prev_total=round(prev_total, 2),
        prev_orders=prev_orders,
        change_pct=round((total - prev_total) / prev_total * 100, 1) if prev_total else None,
        best=best,
        quick=quick,
        by_factory=by_factory,
    )
