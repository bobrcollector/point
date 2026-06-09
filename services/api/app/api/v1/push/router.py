from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.push.schemas import PushSubscribeBody, VapidPublicKeyResponse
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import PushSubscription, User
from app.services.notifications import send_push_to_user

router = APIRouter()


@router.get("/vapid-public-key", response_model=VapidPublicKeyResponse)
async def vapid_public_key():
    key = settings.vapid_public_key.strip()
    return VapidPublicKeyResponse(enabled=bool(key), public_key=key)


@router.post("/subscribe")
async def subscribe_push(
    body: PushSubscribeBody,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    if not settings.vapid_public_key:
        return {"detail": "push_disabled"}
    existing = await session.scalar(
        select(PushSubscription).where(
            PushSubscription.user_id == user.id,
            PushSubscription.endpoint == body.endpoint,
        )
    )
    if existing:
        existing.p256dh = body.keys.p256dh
        existing.auth = body.keys.auth
    else:
        session.add(
            PushSubscription(
                user_id=user.id,
                endpoint=body.endpoint,
                p256dh=body.keys.p256dh,
                auth=body.keys.auth,
            )
        )
    await session.commit()
    return {"detail": "subscribed"}


@router.delete("/subscribe")
async def unsubscribe_push(
    endpoint: str | None = Query(default=None, min_length=8),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Удаляет подписку только текущего браузера (по endpoint), не все устройства."""
    stmt = delete(PushSubscription).where(PushSubscription.user_id == user.id)
    if endpoint:
        stmt = stmt.where(PushSubscription.endpoint == endpoint)
    await session.execute(stmt)
    await session.commit()
    return {"detail": "unsubscribed"}


@router.post("/test")
async def test_push(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    if not settings.vapid_public_key:
        return {"detail": "push_disabled"}
    if not user.notify_push:
        return {"detail": "push_disabled_for_user"}
    sent, failed = await send_push_to_user(
        session,
        user_id=user.id,
        title="Point",
        body="Тестовое push-уведомление. Всё работает!",
        url="/notifications",
        tag="test",
    )
    await session.commit()
    if sent == 0 and failed > 0:
        return {
            "detail": "push_failed",
            "sent": sent,
            "failed": failed,
            "hint": "Отключите и снова включите push в настройках — подписка устарела.",
        }
    if sent == 0:
        return {
            "detail": "no_subscriptions",
            "sent": 0,
            "failed": failed,
            "hint": "Включите push в настройках и разрешите уведомления в браузере.",
        }
    return {"detail": "sent", "sent": sent, "failed": failed}
