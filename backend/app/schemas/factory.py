from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import clean_str, media_url


class FactoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=50)


class _PublicProfile(BaseModel):
    """Mijozlar katalogida ko'rinadigan profil maydonlari."""

    city: str | None = Field(default=None, max_length=100)
    short_description: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=3000)
    logo_url: str | None = Field(default=None, max_length=500)
    cover_url: str | None = Field(default=None, max_length=500)

    @field_validator("city", "short_description", "description")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_str(v)

    @field_validator("logo_url", "cover_url")
    @classmethod
    def _media(cls, v: str | None) -> str | None:
        return media_url(v)


class FactoryCreate(FactoryBase, _PublicProfile):
    is_active: bool = True
    is_public: bool = True


class FactoryUpdate(_PublicProfile):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    address: str | None = Field(default=None, max_length=300)
    phone: str | None = Field(default=None, max_length=50)
    is_active: bool | None = None
    is_public: bool | None = None


class FactoryBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class FactoryOut(FactoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    is_public: bool = True
    city: str | None = None
    short_description: str | None = None
    description: str | None = None
    logo_url: str | None = None
    cover_url: str | None = None
    users_count: int = 0
    created_at: datetime
