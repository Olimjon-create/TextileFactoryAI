from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.core.i18n import t
from app.core.scope import can_access, scoped
from app.models import Product, StoreQuestion, User
from app.models.question import QuestionStatus
from app.schemas.question import QuestionCreate, QuestionOut, QuestionPage
from app.services import store_service, telegram_service


def _out(q: StoreQuestion) -> QuestionOut:
    return QuestionOut(
        id=q.id,
        factory_id=q.factory_id,
        factory_name=q.factory.name,
        product_id=q.product_id,
        product_name=q.product.name if q.product else None,
        customer_name=q.customer_name,
        customer_phone=q.customer_phone,
        question=q.question,
        status=q.status,
        created_at=q.created_at,
        answered_at=q.answered_at,
    )


def create(db: Session, factory_id: int, data: QuestionCreate) -> None:
    factory = store_service._get_public_factory(db, factory_id)
    product = None
    if data.product_id is not None:
        product = db.get(Product, data.product_id)
        if product is None or product.factory_id != factory.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, t("Mahsulot topilmadi"))
    db.add(StoreQuestion(
        factory_id=factory.id,
        product_id=product.id if product else None,
        customer_name=data.customer_name,
        customer_phone=data.customer_phone,
        question=data.question,
    ))
    db.commit()
    telegram_service.send(
        factory, "❓ <b>Mijoz savoli</b> · {product}\n{name}, {phone}\n\n{question}",
        product=product.name if product else factory.name, name=data.customer_name,
        phone=data.customer_phone, question=data.question,
    )


def list_questions(
    db: Session, actor: User, status_: QuestionStatus | None = None, factory_id: int | None = None,
    offset: int = 0, limit: int = 25,
) -> QuestionPage:
    base = scoped(select(StoreQuestion), actor, StoreQuestion.factory_id, factory_id)
    new_count = db.scalar(select(func.count()).select_from(
        base.where(StoreQuestion.status == QuestionStatus.NEW).subquery())) or 0
    if status_ is not None:
        base = base.where(StoreQuestion.status == status_)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.scalars(
        base.options(selectinload(StoreQuestion.factory), selectinload(StoreQuestion.product))
        .order_by(case((StoreQuestion.status == QuestionStatus.NEW, 0), else_=1), StoreQuestion.created_at.desc(), StoreQuestion.id.desc())
        .offset(offset).limit(limit)
    )
    return QuestionPage(items=[_out(q) for q in rows], total=total, new_count=new_count)


def set_status(db: Session, actor: User, question_id: int, new_status: QuestionStatus) -> QuestionOut:
    q = db.get(StoreQuestion, question_id)
    if q is None or not can_access(actor, q.factory_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, t("Savol topilmadi"))
    q.status = new_status
    q.answered_at = datetime.now(timezone.utc) if new_status == QuestionStatus.ANSWERED else None
    db.commit()
    db.refresh(q)
    return _out(q)
