from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.users import service as users_service
from app.api.v1.users.schemas import (
    ChangePasswordRequest,
    InterestsRequest,
    MessageResponse,
    OrganizerRequestResponse,
    UpdateProfileRequest,
    UserMeResponse,
    UserSettingsRequest,
)
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import User

router = APIRouter()


@router.get("/me", response_model=UserMeResponse)
async def get_me(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    full = await users_service.load_user_full(session, user.id)
    if full is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return UserMeResponse.model_validate(users_service.user_me_dict(full))


@router.patch("/me", response_model=UserMeResponse)
async def patch_me(
    body: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    if user.account_type != "organizer":
        data.pop("organizer_description", None)
    full = await users_service.update_profile(session, user, data)
    return UserMeResponse.model_validate(users_service.user_me_dict(full))


@router.post("/me/avatar", response_model=UserMeResponse)
async def upload_avatar(
    avatar: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    raw = await avatar.read()
    try:
        full = await users_service.save_avatar(
            session, user, file_bytes=raw, filename=avatar.filename or "avatar.jpg"
        )
    except ValueError as exc:
        code = str(exc)
        if code == "file_too_large":
            raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 5 МБ)") from exc
        if code == "invalid_avatar_type":
            raise HTTPException(status_code=400, detail="Допустимы JPG, PNG, WEBP, GIF") from exc
        raise
    return UserMeResponse.model_validate(users_service.user_me_dict(full))


@router.post("/me/password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ok = await users_service.change_password(
        session, user, current=body.current_password, new=body.new_password
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    return MessageResponse(message="Пароль изменён")


@router.patch("/me/settings", response_model=UserMeResponse)
async def patch_settings(
    body: UserSettingsRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    full = await users_service.update_settings(session, user, body.model_dump(exclude_unset=True))
    return UserMeResponse.model_validate(users_service.user_me_dict(full))


@router.put("/me/interests", response_model=UserMeResponse)
async def put_interests(
    body: InterestsRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    try:
        full = await users_service.set_interests(session, user, body.category_ids)
    except ValueError as exc:
        if str(exc) == "invalid_categories":
            raise HTTPException(status_code=400, detail="Неизвестные категории") from exc
        raise
    return UserMeResponse.model_validate(users_service.user_me_dict(full))


@router.get("/me/organizer-request", response_model=OrganizerRequestResponse | None)
async def get_organizer_request(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    req = await users_service.latest_organizer_request(session, user.id)
    if req is None:
        return None
    return OrganizerRequestResponse.model_validate(req)


@router.post("/me/organizer-request", response_model=OrganizerRequestResponse, status_code=status.HTTP_201_CREATED)
async def post_organizer_request(
    description: str = Form(..., min_length=20, max_length=4000),
    document: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    raw = await document.read()
    try:
        req = await users_service.create_organizer_request(
            session, user, description=description, file_bytes=raw, filename=document.filename or "doc.pdf"
        )
    except ValueError as exc:
        code = str(exc)
        if code == "viewer_account":
            raise HTTPException(status_code=403, detail="Заявки доступны только профилю организатора") from exc
        if code == "already_organizer":
            raise HTTPException(status_code=400, detail="Вы уже организатор") from exc
        if code == "pending_exists":
            raise HTTPException(status_code=409, detail="Заявка уже на рассмотрении") from exc
        if code == "file_too_large":
            raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 5 МБ)") from exc
        if code == "invalid_document_type":
            raise HTTPException(status_code=400, detail="Допустимы PDF, JPG, PNG, WEBP") from exc
        raise
    return OrganizerRequestResponse.model_validate(req)
