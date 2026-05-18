from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import service as auth_service
from app.api.v1.auth.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    VerifyEmailRequest,
)
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import User

router = APIRouter()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, session: AsyncSession = Depends(get_db)):
    try:
        user = await auth_service.register_user(
            session,
            email=body.email,
            password=body.password,
            display_name=body.display_name,
            account_type=body.account_type,
            organizer_description=body.organizer_description,
        )
    except ValueError as exc:
        code = str(exc)
        if code == "email_taken":
            raise HTTPException(status_code=409, detail="Email уже зарегистрирован") from exc
        if code == "organizer_description_required":
            raise HTTPException(status_code=400, detail="Укажите описание деятельности организатора") from exc
        raise
    return TokenResponse(access_token=auth_service.user_to_token(user))


@router.post("/register/organizer", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_organizer(
    email: str = Form(...),
    password: str = Form(..., min_length=8, max_length=128),
    display_name: str = Form(..., min_length=2, max_length=120),
    organizer_description: str = Form(..., min_length=20, max_length=4000),
    document: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
):
    from app.api.v1.users import service as users_service

    try:
        user = await auth_service.register_user(
            session,
            email=email,
            password=password,
            display_name=display_name,
            account_type="organizer",
            organizer_description=organizer_description,
        )
    except ValueError as exc:
        if str(exc) == "email_taken":
            raise HTTPException(status_code=409, detail="Email уже зарегистрирован") from exc
        raise

    raw = await document.read()
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(status_code=400, detail="Файл слишком большой (макс. 5 МБ)")
    allowed = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
    ext = "." + (document.filename or "").rsplit(".", 1)[-1].lower() if "." in (document.filename or "") else ""
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Допустимы PDF, JPG, PNG, WEBP")

    await users_service.create_organizer_request(
        session,
        user,
        description=organizer_description,
        file_bytes=raw,
        filename=document.filename or "doc.pdf",
        skip_account_type_check=True,
    )
    return TokenResponse(access_token=auth_service.user_to_token(user))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, session: AsyncSession = Depends(get_db)):
    user = await auth_service.authenticate(session, email=body.email, password=body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    return TokenResponse(access_token=auth_service.user_to_token(user))


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest, session: AsyncSession = Depends(get_db)):
    await auth_service.request_password_reset(session, email=body.email)
    return MessageResponse(message="Если email зарегистрирован, ссылка для сброса отправлена (см. логи API в dev).")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest, session: AsyncSession = Depends(get_db)):
    ok = await auth_service.reset_password(session, token=body.token, new_password=body.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail="Ссылка недействительна или устарела")
    return MessageResponse(message="Пароль обновлён")


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(body: VerifyEmailRequest, session: AsyncSession = Depends(get_db)):
    ok = await auth_service.verify_email(session, token=body.token)
    if not ok:
        raise HTTPException(status_code=400, detail="Ссылка подтверждения недействительна")
    return MessageResponse(message="Email подтверждён")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_db)):
    await auth_service.resend_verification(session, user)
    return MessageResponse(message="Письмо с подтверждением отправлено (см. логи API в dev).")
