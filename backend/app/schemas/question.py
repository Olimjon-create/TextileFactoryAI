from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.question import QuestionStatus
from app.schemas.customer import PHONE_PATTERN


class QuestionCreate(BaseModel):
    product_id: int | None = None
    customer_name: str = Field(min_length=2, max_length=200)
    customer_phone: str = Field(max_length=50)
    question: str = Field(min_length=5, max_length=2000)

    @field_validator("customer_name", "question", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("customer_phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_PATTERN.match(v):
            raise ValueError("Telefon raqami noto'g'ri formatda")
        return v


class QuestionOut(BaseModel):
    id: int
    factory_id: int
    factory_name: str
    product_id: int | None
    product_name: str | None
    customer_name: str
    customer_phone: str
    question: str
    status: QuestionStatus
    created_at: datetime
    answered_at: datetime | None


class QuestionPage(BaseModel):
    items: list[QuestionOut]
    total: int
    new_count: int


class QuestionStatusUpdate(BaseModel):
    status: QuestionStatus
