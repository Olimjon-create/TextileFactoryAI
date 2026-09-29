from typing import TYPE_CHECKING

from sqlalchemy import false, Boolean, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin
from app.core.roles import Role

if TYPE_CHECKING:
    from app.models.factory import Factory


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str | None] = mapped_column(String(50))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role, name="user_role"), default=Role.WORKER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    password_weak: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())

    factory_id: Mapped[int | None] = mapped_column(
        ForeignKey("factories.id", ondelete="SET NULL"), index=True
    )
    factory: Mapped["Factory | None"] = relationship(back_populates="users")
