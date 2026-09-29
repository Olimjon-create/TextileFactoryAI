"""So'rovlar chastotasi hisoblagichi (RATE_LIMIT_BACKEND=db): serverless'da barcha nusxalar uchun umumiy."""

from sqlalchemy import BigInteger, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RateLimitHit(Base):
    __tablename__ = "rate_limit_hits"

    # "login:1.2.3.4", "login-email:a@b.uz" ...
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    # Joriy oyna boshlanishi (unix soniya) va shu oynadagi urinishlar soni
    window_start: Mapped[int] = mapped_column(BigInteger, index=True)
    hits: Mapped[int] = mapped_column(Integer)
