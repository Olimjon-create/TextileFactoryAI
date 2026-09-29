from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.payroll import AdjustmentKind
from app.models.resources import Department, PayType

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


class PayrollRow(BaseModel):
    employee_id: int
    factory_id: int
    employee_code: str
    full_name: str
    position: str | None
    department: Department
    pay_type: PayType
    pay_rate: float | None
    pieces: int
    hours: float
    present_days: int
    absent_days: int
    base: float
    bonus: float
    deduction: float
    advance: float
    accrued: float
    to_pay: float
    payment_id: int | None
    paid_amount: float | None
    paid_at: datetime | None


class PayrollTotals(BaseModel):
    employees: int
    base: float
    bonus: float
    deduction: float
    advance: float
    to_pay: float
    paid: float
    unpaid: float
    missing_rate: int


class PayrollReport(BaseModel):
    month: str
    rows: list[PayrollRow]
    totals: PayrollTotals


class AdjustmentCreate(BaseModel):
    employee_id: int
    month: str = Field(pattern=MONTH_PATTERN)
    kind: AdjustmentKind
    amount: float = Field(gt=0, le=1_000_000_000)
    note: str | None = Field(default=None, max_length=300)

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


class AdjustmentOut(BaseModel):
    id: int
    employee_id: int
    kind: AdjustmentKind
    amount: float
    note: str | None
    created_at: datetime


class PaymentCreate(BaseModel):
    employee_id: int
    month: str = Field(pattern=MONTH_PATTERN)
