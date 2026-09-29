from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


WEAK_SECRETS = {"change-me", "secret", "changeme", ""}
WEAK_PASSWORDS = {"Admin12345", "admin", "password", "12345678"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "TextileCore"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/textile_factory_ai"
    AUTO_MIGRATE: bool = True
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_NULL_POOL: bool = False
    BOOTSTRAP_SUPERADMIN: bool = True
    SEED_PUBLIC_DEMO: bool = False

    MEDIA_DIR: str = "media"
    MAX_UPLOAD_MB: int = 5

    SUPABASE_URL: str = ""
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "media"

    RESEND_API_KEY: str = ""
    MAIL_FROM: str = "TextileCore <onboarding@resend.dev>"
    APP_URL: str = ""

    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_ADMIN_CHAT_ID: str = ""
    CRON_SECRET: str = ""
    ANTHROPIC_API_KEY: str = ""
    ASSISTANT_MODEL: str = "claude-opus-5-5"

    PAYMENT_PROVIDER: str = "demo"
    ALLOW_DEMO_PAYMENTS: bool = False

    SELF_REGISTRATION_ENABLED: bool = False

    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_BACKEND: str = "memory"
    TRUST_PROXY_HEADERS: bool = False

    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    CORS_ORIGINS: str = "http://localhost:5173"

    SUPERADMIN_EMAIL: str = "admin@textile.ai"
    SUPERADMIN_PASSWORD: str = "Admin12345"
    SUPERADMIN_FULL_NAME: str = "Super Admin"

    GOOGLE_CLIENT_ID: str = ""

    TIMEZONE_OFFSET_HOURS: float = 5
    LATE_GRACE_MINUTES: int = 5

    @field_validator("DATABASE_URL")
    @classmethod
    def _driver(cls, v: str) -> str:
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def mail_enabled(self) -> bool:
        return bool(self.RESEND_API_KEY.strip())

    @property
    def assistant_enabled(self) -> bool:
        return bool(self.ANTHROPIC_API_KEY.strip())

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.TELEGRAM_BOT_TOKEN.strip())

    @property
    def supabase_storage_enabled(self) -> bool:
        return bool(self.SUPABASE_URL.strip() and self.SUPABASE_SECRET_KEY.strip())

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    def validate_for_production(self) -> None:
        """Productionda xavfli standart sozlamalar bilan ishga tushmaslik (fail fast)."""
        if not self.is_production:
            return
        problems = []
        if self.JWT_SECRET_KEY in WEAK_SECRETS or len(self.JWT_SECRET_KEY) < 32:
            problems.append("JWT_SECRET_KEY kamida 32 belgili tasodifiy qiymat bo'lsin")
        if self.BOOTSTRAP_SUPERADMIN and (self.SUPERADMIN_PASSWORD in WEAK_PASSWORDS or len(self.SUPERADMIN_PASSWORD) < 12):
            problems.append("SUPERADMIN_PASSWORD kamida 12 belgili bo'lsin (yoki BOOTSTRAP_SUPERADMIN=false)")
        if self.PAYMENT_PROVIDER == "demo" and not self.ALLOW_DEMO_PAYMENTS:
            problems.append("PAYMENT_PROVIDER=demo productionda o'chiq (haqiqiy provayder yoki ALLOW_DEMO_PAYMENTS=true)")
        if "*" in self.cors_origins_list:
            problems.append("CORS_ORIGINS='*' productionda ruxsat etilmaydi")
        if problems:
            raise RuntimeError("Production sozlamalari xavfsiz emas: " + "; ".join(problems))

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
