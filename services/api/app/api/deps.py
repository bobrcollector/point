"""Зависимости API (временная авторизация до модуля auth команды)."""

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User


async def get_current_organizer_id(
    db: AsyncSession = Depends(get_db),
    x_user_id: int | None = Header(default=None, alias="X-User-Id"),
) -> int:
    if x_user_id is not None and x_user_id > 0:
        uid = await db.scalar(select(User.id).where(User.id == x_user_id))
        if uid is not None:
            return int(uid)
    uid = await db.scalar(select(User.id).where(User.email == "dev@point.local"))
    if uid is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден. Запустите npm run db:seed")
    return int(uid)
