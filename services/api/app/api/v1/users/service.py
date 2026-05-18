from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import Category, OrganizerRequest, User, UserCategory

AVATAR_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ORGANIZER_DOC_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}


def public_upload_url(stored_path: str | None) -> str | None:
    if not stored_path:
        return None
    if stored_path.startswith("http://") or stored_path.startswith("https://"):
        return stored_path
    normalized = stored_path.replace("\\", "/").lstrip("/")
    if normalized.startswith("uploads/"):
        normalized = normalized[len("uploads/") :]
    return f"/uploads/{normalized}"


def user_me_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "account_type": user.account_type,
        "avatar_url": public_upload_url(user.avatar_url),
        "bio": user.bio,
        "organizer_description": user.organizer_description,
        "phone": user.phone,
        "city": user.city,
        "email_verified": user.email_verified,
        "created_at": user.created_at,
        "notify_email": user.notify_email,
        "notify_push": user.notify_push,
        "locale": user.locale,
        "profile_visibility": user.profile_visibility,
        "interests": [{"id": c.id, "name": c.name} for c in (user.interest_categories or [])],
    }


async def load_user_full(session: AsyncSession, user_id: int) -> User | None:
    q = select(User).where(User.id == user_id).options(selectinload(User.interest_categories))
    return await session.scalar(q)


async def update_profile(session: AsyncSession, user: User, data: dict) -> User:
    for key, value in data.items():
        if value is not None:
            setattr(user, key, value)
    await session.commit()
    return await load_user_full(session, user.id) or user


async def change_password(session: AsyncSession, user: User, *, current: str, new: str) -> bool:
    if not verify_password(current, user.password_hash):
        return False
    user.password_hash = hash_password(new)
    await session.commit()
    return True


async def update_settings(session: AsyncSession, user: User, data: dict) -> User:
    for key, value in data.items():
        if value is not None:
            setattr(user, key, value)
    await session.commit()
    return await load_user_full(session, user.id) or user


async def set_interests(session: AsyncSession, user: User, category_ids: list[int]) -> User:
    if category_ids:
        found = (
            await session.execute(select(Category.id).where(Category.id.in_(category_ids)))
        ).scalars().all()
        if len(found) != len(set(category_ids)):
            raise ValueError("invalid_categories")
    await session.execute(delete(UserCategory).where(UserCategory.user_id == user.id))
    for cid in set(category_ids):
        session.add(UserCategory(user_id=user.id, category_id=cid))
    await session.commit()
    return await load_user_full(session, user.id) or user


def _save_upload(subdir: str, file_bytes: bytes, original_name: str, allowed_ext: set[str]) -> str:
    upload_root = Path(settings.upload_dir) / subdir
    upload_root.mkdir(parents=True, exist_ok=True)
    ext = Path(original_name).suffix.lower()[:12] or ".bin"
    if ext not in allowed_ext:
        raise ValueError("invalid_extension")
    name = f"{uuid.uuid4().hex}{ext}"
    path = upload_root / name
    path.write_bytes(file_bytes)
    return str((Path(subdir) / name).as_posix())


async def save_avatar(session: AsyncSession, user: User, *, file_bytes: bytes, filename: str) -> User:
    if len(file_bytes) > settings.max_upload_bytes:
        raise ValueError("file_too_large")
    try:
        rel_path = _save_upload("avatars", file_bytes, filename, AVATAR_EXTENSIONS)
    except ValueError as exc:
        if str(exc) == "invalid_extension":
            raise ValueError("invalid_avatar_type") from exc
        raise
    user.avatar_url = rel_path
    await session.commit()
    return await load_user_full(session, user.id) or user


async def create_organizer_request(
    session: AsyncSession,
    user: User,
    *,
    description: str,
    file_bytes: bytes,
    filename: str,
    skip_account_type_check: bool = False,
) -> OrganizerRequest:
    if not skip_account_type_check and user.account_type != "organizer":
        raise ValueError("viewer_account")
    if user.role in ("organizer", "moderator", "admin"):
        raise ValueError("already_organizer")
    pending = await session.scalar(
        select(OrganizerRequest.id).where(
            OrganizerRequest.user_id == user.id, OrganizerRequest.status == "pending"
        )
    )
    if pending is not None:
        raise ValueError("pending_exists")
    if len(file_bytes) > settings.max_upload_bytes:
        raise ValueError("file_too_large")
    try:
        doc_path = _save_upload("organizer", file_bytes, filename, ORGANIZER_DOC_EXTENSIONS)
    except ValueError as exc:
        if str(exc) == "invalid_extension":
            raise ValueError("invalid_document_type") from exc
        raise
    req = OrganizerRequest(user_id=user.id, description=description.strip(), document_path=doc_path)
    session.add(req)
    await session.commit()
    await session.refresh(req)
    return req


async def latest_organizer_request(session: AsyncSession, user_id: int) -> OrganizerRequest | None:
    return await session.scalar(
        select(OrganizerRequest)
        .where(OrganizerRequest.user_id == user_id)
        .order_by(OrganizerRequest.created_at.desc())
        .limit(1)
    )
