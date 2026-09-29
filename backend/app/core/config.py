from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


WEAK_SECRETS = {"change-me", "secret", "changeme", ""}
WEAK_PASSWORDS = {"Admin12345", "admin", "password", "12345678"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "TextileCore"
    API_V1_PREFIX: str = "/api/v1"
    # "production" — xavfsizlik talablari qat'iy tekshiriladi (validate_for_production), /docs yopiladi
    ENVIRONMENT: str = "development"

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@localhost:5432/textile_factory_ai"
    # Ishga tushishda `alembic upgrade head` avtomatik bajarilsinmi
    AUTO_MIGRATE: bool = True
    # PostgreSQL ulanishlar puli. Serverless'da DB_NULL_POOL=true (+ Neon/PgBouncer pooled URL)
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_NULL_POOL: bool = False
    # SUPERADMIN_* dan super admin yaratilsinmi (ochiq deployda parol berilmagan bo'lsa — o'chiq)
    BOOTSTRAP_SUPERADMIN: bool = True
    # Bo'sh bazaga to'qima nomli demo zavodlarni qo'shish (ochiq deploy uchun, scripts/public_demo.py)
    SEED_PUBLIC_DEMO: bool = False

    # Yuklangan rasmlar papkasi (backend papkasiga nisbatan) va maksimal hajmi
    MEDIA_DIR: str = "media"
    MAX_UPLOAD_MB: int = 5

    # Supabase Storage (ixtiyoriy). URL va secret (service_role) kalit berilsa rasmlar MEDIA_DIR o'rniga
    # Supabase bucket'iga yuklanadi. Kalit faqat backendda turadi — frontendga hech qachon bermang.
    SUPABASE_URL: str = ""
    SUPABASE_SECRET_KEY: str = ""
    SUPABASE_STORAGE_BUCKET: str = "media"

    # Parolni tiklash xatlari (Resend). Bo'sh bo'lsa "Parolni unutdingizmi?" ko'rinmaydi
    RESEND_API_KEY: str = ""
    MAIL_FROM: str = "TextileCore <onboarding@resend.dev>"
    # Xatdagi havola uchun sayt manzili (bo'sh bo'lsa so'rov manzilidan olinadi)
    APP_URL: str = ""

    # Telegram bildirishnomalar: @BotFather bergan token. Bo'sh bo'lsa o'chiq
    TELEGRAM_BOT_TOKEN: str = ""

    # To'lov provayderi: hozircha faqat "demo" (test rejimi, haqiqiy pul yechilmaydi)
    PAYMENT_PROVIDER: str = "demo"
    # Productionda demo to'lov (xaridor buyurtmasini o'zi "to'langan" qila oladi) faqat ochiq ruxsat bilan
    ALLOW_DEMO_PAYMENTS: bool = False

    # Ochiq ro'yxatdan o'tish (/register, Google orqali yangi zavod). O'chiq bo'lsa zavod egalarini
    # super admin "Foydalanuvchilar" bo'limida login/parol bilan yaratadi
    SELF_REGISTRATION_ENABLED: bool = False

    # So'rovlar chastotasini cheklash (login, ro'yxatdan o'tish, ochiq katalog buyurtmasi)
    RATE_LIMIT_ENABLED: bool = True
    # "memory" — bitta server xotirasida; "db" — bazada (Vercel kabi bir nechta nusxada ishlaganda)
    RATE_LIMIT_BACKEND: str = "memory"
    # Proksi ortida (Vercel, nginx) mijoz IP'si X-Forwarded-For'dan olinsinmi
    TRUST_PROXY_HEADERS: bool = False

    JWT_SECRET_KEY: str = "change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    CORS_ORIGINS: str = "http://localhost:5173"

    SUPERADMIN_EMAIL: str = "admin@textile.ai"
    SUPERADMIN_PASSWORD: str = "Admin12345"
    SUPERADMIN_FULL_NAME: str = "Super Admin"

    # Google Cloud Console → OAuth 2.0 Client ID (Web application).
    # Bo'sh bo'lsa "Google orqali kirish" o'chiq bo'ladi.
    GOOGLE_CLIENT_ID: str = ""

    # Zavodning mahalliy vaqti (davomat: "hozir keldi/ketdi"). O'zbekiston: UTC+5, yozgi vaqt yo'q
    TIMEZONE_OFFSET_HOURS: float = 5
    # Smena boshlanishidan necha daqiqagacha kechikish hisoblanmaydi
    LATE_GRACE_MINUTES: int = 5

    @field_validator("DATABASE_URL")
    @classmethod
    def _driver(cls, v: str) -> str:
        # Neon/Vercel "postgres://..." yoki "postgresql://..." beradi — SQLAlchemy'ga psycopg 3 drayverini ko'rsatamiz
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

    @property
    def mail_enabled(self) -> bool:
        return bool(self.RESEND_API_KEY.strip())

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
