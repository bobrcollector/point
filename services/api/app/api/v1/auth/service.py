from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_token,
    verify_password,
)
from app.models import User

logger = logging.getLogger(__name__)


def user_to_token(user: User) -> str:
    return create_access_token(user.email, role=user.role, user_id=user.id)


async def register_user(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    display_name: str,
) -> User:
    exists = await session.scalar(select(User.id).where(User.email == email.lower()))
    if exists is not None:
        raise ValueError("email_taken")
    token = new_token()
    user = User(
        email=email.lower().strip(),
        display_name=display_name.strip(),
        password_hash=hash_password(password),
        role="user",
        account_type="viewer",
        email_verified=False,
        verification_token=hash_token(token),
        verification_token_expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    _log_verification_link(email, token)
    return user


def _log_verification_link(email: str, token: str) -> None:
    url = f"{settings.app_public_url}/verify-email?token={token}"
    logger.info("Email verification for %s: %s", email, url)


async def authenticate(session: AsyncSession, *, email: str, password: str) -> User | None:
    user = await session.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None or not verify_password(password, user.password_hash):
        return None
    if user.is_banned:
        raise ValueError("user_banned")
    return user


async def request_password_reset(session: AsyncSession, *, email: str) -> None:
    user = await session.scalar(select(User).where(User.email == email.lower().strip()))
    if user is None:
        return
    token = new_token()
    user.reset_token_hash = hash_token(token)
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
    await session.commit()
    url = f"{settings.app_public_url}/reset-password?token={token}"
    logger.info("Password reset for %s: %s", email, url)


async def reset_password(session: AsyncSession, *, token: str, new_password: str) -> bool:
    token_hash = hash_token(token)
    user = await session.scalar(select(User).where(User.reset_token_hash == token_hash))
    if user is None:
        return False
    if user.reset_token_expires_at is None or user.reset_token_expires_at < datetime.now(timezone.utc):
        return False
    user.password_hash = hash_password(new_password)
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    await session.commit()
    return True


async def verify_email(session: AsyncSession, *, token: str) -> bool:
    token_hash = hash_token(token)
    user = await session.scalar(select(User).where(User.verification_token == token_hash))
    if user is None:
        return False
    if user.verification_token_expires_at is None or user.verification_token_expires_at < datetime.now(timezone.utc):
        return False
    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires_at = None
    await session.commit()
    return True


async def resend_verification(session: AsyncSession, user: User) -> None:
    if user.email_verified:
        return
    token = new_token()
    user.verification_token = hash_token(token)
    user.verification_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=48)
    await session.commit()
    _log_verification_link(user.email, token)
