from datetime import date
from typing import Literal

from pydantic import BaseModel

RevenuePeriod = Literal["day", "week", "month", "year"]


class RevenueBucket(BaseModel):
    start: date
    end: date
    label: str
    full_label: str
    revenue: float
    orders: int
    current: bool = False


class RevenueQuick(BaseModel):
    """Joriy davrlar boshidan bugungacha: bugun, shu hafta, shu oy, shu yil."""

    today: float = 0
    week: float = 0
    month: float = 0
    year: float = 0


class FactoryRevenue(BaseModel):
    factory_id: int
    name: str
    revenue: float
    orders: int


class RevenueOut(BaseModel):
    period: RevenuePeriod
    date_from: date
    date_to: date
    buckets: list[RevenueBucket]
    total: float
    orders: int
    average_order: float
    prev_total: float
    prev_orders: int
    change_pct: float | None
    best: RevenueBucket | None
    quick: RevenueQuick
    by_factory: list[FactoryRevenue] = []
