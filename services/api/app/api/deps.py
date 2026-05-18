"""Organizer API auth helpers."""

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user_optional
from app.db.session import get_db
from app.models import User


async def get_current_organizer_id(
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> int:
    if current_user is not None:
        if current_user.role not in {"organizer", "moderator", "admin"} and current_user.account_type != "organizer":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ только для организаторов")
        return int(current_user.id)
    uid = await db.scalar(select(User.id).where(User.email == "dev@point-demo.ru"))
    if uid is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден. Запустите npm run db:seed")
    return int(uid)
