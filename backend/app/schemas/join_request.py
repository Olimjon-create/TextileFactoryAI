from datetime import datetime

from pydantic import BaseModel, Field

from app.models.resources import Department, PayType


class JoinLinkOut(BaseModel):
    enabled: bool
    link_url: str | None
    factory_linked: bool
    pending: int


class JoinRequestOut(BaseModel):
    id: int
    factory_id: int
    factory_name: str
    full_name: str
    phone: str | None
    created_at: datetime


class JoinApprove(BaseModel):
    department: Department
    position: str | None = Field(default=None, max_length=100)
    pay_type: PayType | None = None
    pay_rate: float | None = Field(default=None, ge=0, le=10_000_000_000)
