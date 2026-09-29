from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.schemas.finance import ExpenseCreate, ExpenseOut, ProfitLoss
from app.schemas.payroll import MONTH_PATTERN
from app.services import finance_service
from app.services.costing_service import FINANCE_ROLES

router = APIRouter(prefix="/finance", tags=["Finance"])
can_finance = require_roles(*FINANCE_ROLES)


@router.get("/profit-loss", response_model=ProfitLoss)
def profit_loss(
    month: str = Query(pattern=MONTH_PATTERN),
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(can_finance),
):
    return finance_service.profit_loss(db, actor, month, factory_id)


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(data: ExpenseCreate, db: Session = Depends(get_db), actor: User = Depends(can_finance)):
    return finance_service.create_expense(db, actor, data)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: int, db: Session = Depends(get_db), actor: User = Depends(can_finance)):
    finance_service.delete_expense(db, actor, expense_id)
