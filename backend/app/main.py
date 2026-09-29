from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

import app.models
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.i18n import set_lang
from app.core.migrations import run_migrations
from app.services import telegram_service
from app.services.bootstrap import ensure_superadmin
from app.services.upload_service import media_dir


_prepared = False


def prepare() -> None:
    """Bazani tayyorlash (bir marta): migratsiyalar, super admin, ochiq deployda demo katalog.

    Oddiy serverda lifespan chaqiradi; serverless'da (Vercel, api/index.py) import paytida chaqiriladi.
    """
    global _prepared
    if _prepared:
        return
    settings.validate_for_production()
    if settings.AUTO_MIGRATE:
        run_migrations()
    if settings.BOOTSTRAP_SUPERADMIN and ensure_superadmin():
        print(f"SUPER_ADMIN yaratildi: {settings.SUPERADMIN_EMAIL}")
    if settings.SEED_PUBLIC_DEMO:
        from scripts.demo_workflow import seed_workflow_demo
        from scripts.public_demo import seed_public

        seed_public()
        seed_workflow_demo()
    _prepared = True


@asynccontextmanager
async def lifespan(_: FastAPI):
    prepare()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="0.1.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def request_language(request: Request, call_next):
    set_lang(request.headers.get("accept-language"))
    try:
        return await call_next(request)
    except Exception as exc:
        await run_in_threadpool(telegram_service.alert_admin, request.method, request.url.path, exc)
        raise


app.include_router(api_router, prefix=settings.API_V1_PREFIX)

app.mount("/media", StaticFiles(directory=media_dir()), name="media")


@app.get("/health", tags=["System"])
def health():
    return {"status": "ok"}
