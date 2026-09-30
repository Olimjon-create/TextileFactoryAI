from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.schemas.payroll import MONTH_PATTERN, AdjustmentCreate, AdjustmentOut, PaymentCreate, PayrollReport, PayrollRow
from app.services import payroll_service
from app.services.workforce_service import PAY_VIEW_ROLES

router = APIRouter(prefix="/payroll", tags=["Payroll"])
can_pay = require_roles(*PAY_VIEW_ROLES)


@router.get("", response_model=PayrollReport)
def payroll(
    month: str = Query(pattern=MONTH_PATTERN),
    factory_id: int | None = None,
    db: Session = Depends(get_db),
    actor: User = Depends(can_pay),
):
    return payroll_service.report(db, actor, month, factory_id)


@router.get("/adjustments", response_model=list[AdjustmentOut])
def adjustments(
    employee_id: int,
    month: str = Query(pattern=MONTH_PATTERN),
    db: Session = Depends(get_db),
    actor: User = Depends(can_pay),
):
    return payroll_service.list_adjustments(db, actor, month, employee_id)


@router.post("/adjustments", response_model=AdjustmentOut, status_code=status.HTTP_201_CREATED)
def add_adjustment(data: AdjustmentCreate, db: Session = Depends(get_db), actor: User = Depends(can_pay)):
    return payroll_service.add_adjustment(db, actor, data)


@router.delete("/adjustments/{adjustment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_adjustment(adjustment_id: int, db: Session = Depends(get_db), actor: User = Depends(can_pay)):
    payroll_service.delete_adjustment(db, actor, adjustment_id)


@router.post("/payments", response_model=PayrollRow, status_code=status.HTTP_201_CREATED)
def pay(data: PaymentCreate, db: Session = Depends(get_db), actor: User = Depends(can_pay)):
    return payroll_service.pay(db, actor, data)


class PayslipSend(BaseModel):
    month: str = Field(pattern=MONTH_PATTERN)


class PayslipSendResult(BaseModel):
    sent: int
    not_linked: int


@router.post("/payslips/send", response_model=PayslipSendResult)
def send_payslips(data: PayslipSend, factory_id: int | None = None, db: Session = Depends(get_db), actor: User = Depends(can_pay)):
    """Hisob varaqalarini Telegram botga ulangan xodimlarga yuborish."""
    return payroll_service.send_payslips(db, actor, data.month, factory_id)


@router.delete("/payments/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_payment(payment_id: int, db: Session = Depends(get_db), actor: User = Depends(can_pay)):
    payroll_service.cancel_payment(db, actor, payment_id)
