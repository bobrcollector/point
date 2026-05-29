from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.notifications.schemas import NotificationOut
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import Notification, User

router = APIRouter()


def _to_out(n: Notification) -> NotificationOut:
    return NotificationOut(
        notification_id=n.id,
        type=n.type,
        content=n.content,
        is_read=n.is_read,
        created_at=n.created_at,
    )


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    rows = (
        await session.execute(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
        )
    ).scalars().all()
    return [_to_out(n) for n in rows]


@router.put("/read-all", response_model=list[NotificationOut])
async def mark_all_read(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    rows = (
        await session.execute(
            select(Notification)
            .where(Notification.user_id == user.id)
            .order_by(Notification.created_at.desc())
        )
    ).scalars().all()
    for n in rows:
        n.is_read = True
    await session.commit()
    return [_to_out(n) for n in rows]


@router.put("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    n = await session.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    n.is_read = True
    await session.commit()
    await session.refresh(n)
    return _to_out(n)
