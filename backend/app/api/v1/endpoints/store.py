"""Ochiq katalog — login talab qilinmaydi."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.database import get_db
from app.core.i18n import get_lang
from app.schemas.store import (
    AssistantReply,
    AssistantRequest,
    AssistantStatus,
    CheckoutRequest,
    CheckoutResponse,
    DemoPaymentRequest,
    FindOrderRequest,
    MyOrdersRequest,
    PublicOrder,
    StoreFactoryCard,
    StoreFactoryDetail,
    StoreFeaturedProduct,
    StoreProductPage,
)
from app.schemas.question import QuestionCreate
from app.services import assistant_service, question_service, store_service

router = APIRouter(prefix="/store", tags=["Store (public)"])


@router.get("/factories", response_model=list[StoreFactoryCard])
def list_factories(search: str | None = Query(default=None, max_length=100), db: Session = Depends(get_db)):
    return store_service.list_factories(db, search)


@router.get("/products", response_model=StoreProductPage)
def list_products(
    search: str | None = Query(default=None, max_length=100),
    category: str | None = Query(default=None, max_length=100),
    sort: str = Query(default="new", pattern="^(new|price_asc|price_desc)$"),
    limit: int = Query(default=12, ge=1, le=48),
    offset: int = Query(default=0, ge=0, le=10_000),
    db: Session = Depends(get_db),
):
    return store_service.list_products(db, search, category, sort, limit, offset)


@router.get("/featured", response_model=list[StoreFeaturedProduct])
def featured(limit: int = Query(default=3, ge=1, le=12), db: Session = Depends(get_db)):
    """Bosh sahifa kollaji: har xil zavodlardan tanlangan mahsulotlar."""
    return store_service.featured_products(db, limit)


@router.get("/factories/{factory_id}", response_model=StoreFactoryDetail)
def get_factory(factory_id: int, db: Session = Depends(get_db)):
    return store_service.get_factory(db, factory_id)


@router.post("/factories/{factory_id}/questions", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(rate_limit.by_ip("store-question", 5, 3600))])
def ask_question(factory_id: int, data: QuestionCreate, db: Session = Depends(get_db)):
    question_service.create(db, factory_id, data)


@router.get("/assistant", response_model=AssistantStatus)
def assistant_status():
    return AssistantStatus(enabled=assistant_service.enabled())


@router.post("/assistant", response_model=AssistantReply, dependencies=[Depends(rate_limit.by_ip("assistant", 30, 3600))])
def assistant(data: AssistantRequest, db: Session = Depends(get_db)):
    messages = [m.model_dump() for m in data.messages][-12:]
    while messages and messages[0]["role"] != "user":
        messages.pop(0)
    reply, products = assistant_service.ask(db, messages, get_lang())
    return AssistantReply(reply=reply, products=products)


@router.post("/orders", response_model=CheckoutResponse, status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit.by_ip("checkout", 20, 3600))])
def create_order(data: CheckoutRequest, db: Session = Depends(get_db)):
    return store_service.create_order(db, data)


@router.post("/orders/my", response_model=list[PublicOrder], dependencies=[Depends(rate_limit.by_ip("my-orders", 60, 600))])
def my_orders(data: MyOrdersRequest, db: Session = Depends(get_db)):
    """Mijozning "Buyurtmalarim" sahifasi: brauzerda saqlangan kalitlar bo'yicha to'langan buyurtmalar."""
    return store_service.my_orders(db, data.tokens)


@router.post("/orders/find", response_model=PublicOrder, dependencies=[Depends(rate_limit.by_ip("find-order", 10, 600))])
def find_order(data: FindOrderRequest, db: Session = Depends(get_db)):
    """Boshqa qurilmadan: buyurtma raqami + telefon bo'yicha topish."""
    return store_service.find_order(db, data.order_number, data.customer_phone)


@router.get("/orders/{token}", response_model=PublicOrder)
def get_order(token: str, db: Session = Depends(get_db)):
    return store_service.get_order(db, token)


@router.post("/orders/{token}/pay/demo", response_model=PublicOrder, dependencies=[Depends(rate_limit.by_ip("pay-demo", 20, 600))])
def pay_demo(token: str, data: DemoPaymentRequest, db: Session = Depends(get_db)):
    return store_service.pay_demo(db, token, data.card_last4)
