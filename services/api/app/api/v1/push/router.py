from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.push.schemas import PushSubscribeBody, VapidPublicKeyResponse
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import PushSubscription, User

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
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    await session.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))
    await session.commit()
    return {"detail": "unsubscribed"}
