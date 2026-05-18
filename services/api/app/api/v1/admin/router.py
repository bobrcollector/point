from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.admin.schemas import OrganizerRequestAdmin, OrganizerRequestsList, ReviewOrganizerRequest
from app.core.deps import require_moderator
from app.db.session import get_db
from app.models import OrganizerRequest, User

router = APIRouter()


@router.get("/organizer-requests", response_model=OrganizerRequestsList)
async def list_organizer_requests(
    status: str | None = None,
    _mod: User = Depends(require_moderator),
    session: AsyncSession = Depends(get_db),
):
    q = select(OrganizerRequest).options(selectinload(OrganizerRequest.user)).order_by(OrganizerRequest.created_at.desc())
    if status:
        q = q.where(OrganizerRequest.status == status)
    rows = (await session.execute(q)).scalars().all()
    items = [
        OrganizerRequestAdmin(
            id=r.id,
            user_id=r.user_id,
            user_email=r.user.email,
            user_display_name=r.user.display_name,
            status=r.status,
            description=r.description,
            document_path=r.document_path,
            admin_note=r.admin_note,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
        )
        for r in rows
    ]
    return OrganizerRequestsList(items=items)


@router.patch("/organizer-requests/{request_id}", response_model=OrganizerRequestAdmin)
async def review_organizer_request(
    request_id: int,
    body: ReviewOrganizerRequest,
    moderator: User = Depends(require_moderator),
    session: AsyncSession = Depends(get_db),
):
    req = await session.scalar(
        select(OrganizerRequest)
        .where(OrganizerRequest.id == request_id)
        .options(selectinload(OrganizerRequest.user))
    )
    if req is None:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Заявка уже обработана")
    req.status = body.status
    req.admin_note = body.admin_note
    req.reviewed_by_id = moderator.id
    req.reviewed_at = datetime.now(timezone.utc)
    if body.status == "approved":
        req.user.role = "organizer"
        req.user.email_verified = True
    await session.commit()
    await session.refresh(req)
    return OrganizerRequestAdmin(
        id=req.id,
        user_id=req.user_id,
        user_email=req.user.email,
        user_display_name=req.user.display_name,
        status=req.status,
        description=req.description,
        document_path=req.document_path,
        admin_note=req.admin_note,
        created_at=req.created_at,
        reviewed_at=req.reviewed_at,
    )
