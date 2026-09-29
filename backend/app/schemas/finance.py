from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.models.finance import ExpenseCategory


class ExpenseCreate(BaseModel):
    expense_date: date
    category: ExpenseCategory
    amount: float = Field(gt=0, le=100_000_000_000)
    note: str | None = Field(default=None, max_length=300)
    factory_id: int | None = None

    @field_validator("note")
    @classmethod
    def _note(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


class ExpenseOut(BaseModel):
    id: int
    factory_id: int
    expense_date: date
    category: ExpenseCategory
    amount: float
    note: str | None
    created_by_name: str | None
    created_at: datetime


class CategoryAmount(BaseModel):
    category: ExpenseCategory
    amount: float


class ProfitLoss(BaseModel):
    month: str
    revenue: float
    orders: int
    materials: float
    payroll: float
    expenses: float
    expenses_by_category: list[CategoryAmount]
    total_costs: float
    profit: float
    margin_pct: float | None
    payroll_missing_rate: int
    items: list[ExpenseOut]
