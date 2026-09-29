from fastapi import APIRouter, Depends, File, UploadFile, status
from pydantic import BaseModel

from app.core.deps import require_roles
from app.core.roles import Role
from app.models import User
from app.services import upload_service

router = APIRouter(prefix="/uploads", tags=["Uploads"])

# Zavod profili yoki mahsulot rasmini o'zgartira oladigan rollar
can_upload = require_roles(Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER, Role.PRODUCTION_MANAGER)


class UploadedImage(BaseModel):
    url: str


@router.post("/images", response_model=UploadedImage, status_code=status.HTTP_201_CREATED)
async def upload_image(file: UploadFile = File(...), _: User = Depends(can_upload)):
    return UploadedImage(url=await upload_service.save_image(file))
