from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.core.roles import Role
from app.schemas.factory import FactoryBrief


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=50)


class UserCreate(UserBase):
    password: str = Field(min_length=6, max_length=128)
    role: Role = Role.WORKER
    # SUPER_ADMIN uchun majburiy (boshqa rollarda avtomatik o'z fabrikasi olinadi)
    factory_id: int | None = None
    # Faqat SUPER_ADMIN, zavod egasi yaratilganda: factory_id o'rniga — shu nomli yangi fabrika ochiladi
    factory_name: str | None = Field(default=None, min_length=2, max_length=200)
    is_active: bool = True


class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=2, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    password: str | None = Field(default=None, min_length=6, max_length=128)
    role: Role | None = None
    factory_id: int | None = None
    is_active: bool | None = None


class UserOut(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Role
    is_active: bool
    factory_id: int | None
    factory: FactoryBrief | None = None
    created_at: datetime
