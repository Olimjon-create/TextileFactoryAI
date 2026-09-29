from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models import User
from app.models.question import QuestionStatus
from app.schemas.question import QuestionOut, QuestionPage, QuestionStatusUpdate
from app.services import question_service
from app.services.order_service import ORDER_EDITOR_ROLES, ORDER_VIEW_ROLES

router = APIRouter(prefix="/questions", tags=["Questions"])

can_view = require_roles(*ORDER_VIEW_ROLES)
can_edit = require_roles(*ORDER_EDITOR_ROLES)


@router.get("", response_model=QuestionPage)
def list_questions(
    status_: QuestionStatus | None = Query(default=None, alias="status"),
    factory_id: int | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(can_view),
):
    return question_service.list_questions(db, actor, status_, factory_id, offset, limit)


@router.patch("/{question_id}", response_model=QuestionOut)
def update_status(question_id: int, data: QuestionStatusUpdate, db: Session = Depends(get_db), actor: User = Depends(can_edit)):
    return question_service.set_status(db, actor, question_id, data.status)
