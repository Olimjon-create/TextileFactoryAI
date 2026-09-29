from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    attendance,
    audit,
    auth,
    cron,
    customers,
    dashboard,
    factories,
    inventory,
    logistics,
    orders,
    payroll,
    procurement,
    production,
    products,
    questions,
    resources,
    store,
    telegram,
    uploads,
    users,
    vision,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(dashboard.router)
api_router.include_router(factories.router)
api_router.include_router(users.router)
api_router.include_router(products.router)
api_router.include_router(customers.router)
api_router.include_router(orders.router)
api_router.include_router(payroll.router)
api_router.include_router(questions.router)
api_router.include_router(inventory.router)
api_router.include_router(resources.router)
api_router.include_router(attendance.router)
api_router.include_router(production.router)
api_router.include_router(procurement.router)
api_router.include_router(logistics.router)
api_router.include_router(analytics.router)
api_router.include_router(vision.router)
api_router.include_router(audit.router)
api_router.include_router(uploads.router)
api_router.include_router(telegram.router)
api_router.include_router(cron.router)
api_router.include_router(store.router)

