from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models import User
from app.schemas.analytics import OverviewOut
from app.schemas.dashboard import DashboardStats
from app.schemas.revenue import RevenueOut, RevenuePeriod
from app.services import dashboard_service, order_service, revenue_service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/stats", response_model=DashboardStats)
def stats(db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    return dashboard_service.get_stats(db, actor)


@router.get("/overview", response_model=OverviewOut)
def overview(factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(get_current_user)):
    """Rahbar dashboardi: har bir bo'lim faqat o'sha modulni ko'ra oladigan rollarga."""
    return dashboard_service.overview(db, actor, factory_id)


@router.get("/revenue", response_model=RevenueOut)
def revenue(
    period: RevenuePeriod = "day",
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(*order_service.ORDER_VIEW_ROLES)),
):
    """Tushum: kunlik (30 kun), haftalik (12 hafta), oylik (12 oy), yillik (5 yil) — oldingi davr bilan solishtirib."""
    return revenue_service.revenue(db, actor, period, factory_id)
