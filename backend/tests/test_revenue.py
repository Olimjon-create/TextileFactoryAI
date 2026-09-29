"""Tushum: kunlik/haftalik/oylik/yillik kesim, mahalliy vaqt, oldingi davr bilan solishtirish, ruxsatlar."""

import secrets
from datetime import date, datetime, timezone

from app.core.database import SessionLocal
from app.models import Order
from app.models.order import OrderStatus, PaymentStatus
from app.services import revenue_service
from tests.conftest import API, add_user, register_owner

TODAY = date(2026, 9, 26)


def _order(factory_id: int, paid_at: datetime | None, amount: float, status=OrderStatus.COMPLETED, paid=PaymentStatus.PAID):
    with SessionLocal() as db:
        db.add(Order(
            factory_id=factory_id, public_token=secrets.token_hex(16), customer_name="Mijoz", customer_phone="+998900000000",
            status=status, payment_status=paid, payment_provider="demo", paid_at=paid_at, total_amount=amount,
        ))
        db.commit()


def test_revenue_periods(client, monkeypatch):
    monkeypatch.setattr(revenue_service, "_today", lambda: TODAY)
    owner, fid = register_owner(client, "rev@t.uz", "Tushum Tekstil")
    utc = timezone.utc
    _order(fid, datetime(2026, 9, 26, 5, 0, tzinfo=utc), 1_000_000)
    _order(fid, datetime(2026, 9, 25, 20, 30, tzinfo=utc), 500_000)
    _order(fid, datetime(2026, 9, 22, 8, 0, tzinfo=utc), 200_000)
    _order(fid, datetime(2026, 9, 2, 8, 0, tzinfo=utc), 300_000)
    _order(fid, datetime(2026, 3, 10, 8, 0, tzinfo=utc), 400_000)
    _order(fid, datetime(2025, 5, 10, 8, 0, tzinfo=utc), 700_000)
    _order(fid, datetime(2026, 9, 26, 6, 0, tzinfo=utc), 9_999_999, paid=PaymentStatus.PENDING)
    get = lambda period: client.get(f"{API}/dashboard/revenue", headers=owner, params={"period": period}).json()

    day = get("day")
    assert len(day["buckets"]) == 30 and day["buckets"][-1]["start"] == "2026-09-26" and day["buckets"][-1]["current"]
    assert day["buckets"][-1]["revenue"] == 1_500_000 and day["buckets"][-1]["orders"] == 2
    assert day["quick"] == {"today": 1_500_000, "week": 1_700_000, "month": 2_000_000, "year": 2_400_000}
    assert day["total"] == 2_000_000 and day["orders"] == 4 and day["average_order"] == 500_000
    assert day["best"]["start"] == "2026-09-26"

    week = get("week")
    assert len(week["buckets"]) == 12 and week["buckets"][-1]["start"] == "2026-09-21" and week["buckets"][-1]["revenue"] == 1_700_000

    month = get("month")
    assert len(month["buckets"]) == 12 and month["buckets"][-1]["label"] == "Sen" and month["buckets"][-1]["revenue"] == 2_000_000
    assert month["buckets"][0]["start"] == "2025-10-01"
    assert month["total"] == 2_400_000 and month["prev_total"] == 700_000 and month["change_pct"] == round((2_400_000 - 700_000) / 700_000 * 100, 1)

    year = get("year")
    assert [b["label"] for b in year["buckets"]] == ["2022", "2023", "2024", "2025", "2026"]
    assert year["buckets"][-2]["revenue"] == 700_000 and year["buckets"][-1]["revenue"] == 2_400_000

    assert client.get(f"{API}/dashboard/revenue", headers=owner, params={"period": "hour"}).status_code == 422


def test_revenue_permissions_and_isolation(client, monkeypatch):
    monkeypatch.setattr(revenue_service, "_today", lambda: TODAY)
    owner, fid = register_owner(client, "a@t.uz", "A zavod")
    other, fid2 = register_owner(client, "b@t.uz", "B zavod")
    _order(fid, datetime(2026, 9, 26, 5, 0, tzinfo=timezone.utc), 100)
    _order(fid2, datetime(2026, 9, 26, 5, 0, tzinfo=timezone.utc), 900)
    assert client.get(f"{API}/dashboard/revenue", headers=owner).json()["total"] == 100
    assert client.get(f"{API}/dashboard/revenue", headers=other).json()["total"] == 900
    worker = add_user(client, owner, "w@t.uz", "WORKER")
    assert client.get(f"{API}/dashboard/revenue", headers=worker).status_code == 403
