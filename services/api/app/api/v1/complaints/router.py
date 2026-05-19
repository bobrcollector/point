from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.complaints.schemas import ComplaintCreate, ComplaintOut
from app.core.deps import get_current_user
from app.db.session import get_db
from app.models import Complaint, Event, User

router = APIRouter()


def _to_out(c: Complaint) -> ComplaintOut:
    return ComplaintOut(
        complaint_id=c.id,
        user_id=c.user_id,
        event_id=c.event_id,
        reason=c.reason,
        status=c.status,
        created_at=c.created_at,
    )


@router.post("", response_model=ComplaintOut, status_code=201)
async def create_complaint(
    body: ComplaintCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ev = await session.get(Event, body.event_id)
    if ev is None or ev.is_hidden:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    row = Complaint(user_id=user.id, event_id=body.event_id, reason=body.reason.strip())
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_out(row)
