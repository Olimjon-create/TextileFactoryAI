import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.customer import CustomerStatus, CustomerType
from app.schemas.factory import FactoryBrief

CODE_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9._-]{1,29}$")
PHONE_PATTERN = re.compile(r"^\+?[\d\s()-]{7,20}$")
COUNTRY_PATTERN = re.compile(r"^[A-Z]{2}$")


def _clean(value: str | None) -> str | None:
    """Bo'sh satrni None ga aylantiradi, chetdagi bo'shliqlarni olib tashlaydi."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def _code(value: str | None) -> str | None:
    value = _clean(value)
    if value is None:
        return None
    value = value.upper()
    if not CODE_PATTERN.match(value):
        raise ValueError("Kod 2-30 belgidan iborat bo'lsin: lotin harflari, raqamlar, '-', '_' yoki '.'")
    return value


def _phone(value: str | None) -> str | None:
    value = _clean(value)
    if value is not None and not PHONE_PATTERN.match(value):
        raise ValueError("Telefon raqami noto'g'ri formatda")
    return value


def _country(value: str | None) -> str | None:
    value = _clean(value)
    if value is None:
        return None
    value = value.upper()
    if not COUNTRY_PATTERN.match(value):
        raise ValueError("Davlat ISO kodi 2 ta lotin harfidan iborat bo'lsin (masalan: UZ)")
    return value


class _CustomerFields(BaseModel):
    """Create va Update uchun umumiy normallashtirish."""

    @field_validator("name", "contact_person", "address", "notes", mode="before", check_fields=False)
    @classmethod
    def _strip(cls, v):
        return _clean(v) if isinstance(v, str) else v

    @field_validator("email", mode="before", check_fields=False)
    @classmethod
    def _email(cls, v):
        return _clean(v) if isinstance(v, str) else v

    @field_validator("customer_code", check_fields=False)
    @classmethod
    def _validate_code(cls, v):
        return _code(v)

    @field_validator("phone", check_fields=False)
    @classmethod
    def _validate_phone(cls, v):
        return _phone(v)

    @field_validator("country", check_fields=False)
    @classmethod
    def _validate_country(cls, v):
        return _country(v)


class CustomerCreate(_CustomerFields):
    name: str = Field(min_length=2, max_length=200)
    customer_code: str | None = Field(default=None, max_length=30)
    customer_type: CustomerType = CustomerType.COMPANY
    status: CustomerStatus = CustomerStatus.ACTIVE
    contact_person: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    country: str | None = Field(default=None, max_length=2)
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=5000)
    factory_id: int | None = None


class CustomerUpdate(_CustomerFields):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    customer_code: str | None = Field(default=None, max_length=30)
    customer_type: CustomerType | None = None
    status: CustomerStatus | None = None
    contact_person: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    country: str | None = Field(default=None, max_length=2)
    address: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=5000)


class CustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    factory_id: int
    factory: FactoryBrief | None = None
    customer_code: str
    name: str
    customer_type: CustomerType
    status: CustomerStatus
    contact_person: str | None
    phone: str | None
    email: str | None
    country: str | None
    address: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CustomerPage(BaseModel):
    items: list[CustomerOut]
    total: int


class CustomerStats(BaseModel):
    total: int
    by_status: dict[str, int]
