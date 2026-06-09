from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.admin.schemas import (
    AdminEventOut,
    AdminUserOut,
    ChartPoint,
    ComplaintAdminOut,
    DashboardMetrics,
    ModerateEventPayload,
    ResolveComplaintPayload,
    RoleUpdate,
)
from app.api.v1.catalog.schemas import EventDetail
from app.api.v1.catalog.service import event_to_detail_dict
from app.core.deps import require_admin_local
from app.db.session import get_db
from app.models import Complaint, Event, EventParticipation, EventReview, User
from app.services.notifications import (
    complaint_notification_content,
    complaint_push_title,
    create_notification,
    moderation_notification_content,
    moderation_push_title,
)

router = APIRouter()


def _user_out(u: User) -> AdminUserOut:
    return AdminUserOut(user_id=u.id, email=u.email, role=u.role, is_banned=u.is_banned, created_at=u.created_at)


def _event_out(ev: Event) -> AdminEventOut:
    return AdminEventOut(
        event_id=ev.id,
        organizer_id=ev.organizer_id,
        title=ev.title,
        description=ev.description,
        event_datetime=ev.event_datetime,
        location=ev.location,
        status=ev.status,
        moderation_reason=ev.moderation_reason,
        is_hidden=ev.is_hidden,
        created_at=ev.created_at,
    )


def _complaint_out(c: Complaint, user: User | None = None, ev: Event | None = None) -> ComplaintAdminOut:
    user_name = "—"
    if user is not None:
        user_name = (user.display_name or "").strip() or user.email
    event_title = ev.title if ev is not None else f"Событие #{c.event_id}"
    return ComplaintAdminOut(
        complaint_id=c.id,
        user_id=c.user_id,
        event_id=c.event_id,
        reason=c.reason,
        status=c.status,
        created_at=c.created_at,
        user_name=user_name,
        event_title=event_title,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def admin_users(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    rows = (await session.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    return [_user_out(u) for u in rows]


@router.put("/users/{user_id}/ban")
async def admin_ban_user(user_id: int, _: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Нельзя заблокировать администратора")
    user.is_banned = True
    await session.commit()
    return {"detail": "User banned"}


@router.put("/users/{user_id}/unban")
async def admin_unban_user(user_id: int, _: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.is_banned = False
    await session.commit()
    return {"detail": "User unbanned"}


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: int, admin: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить себя")
    if user.role == "admin":
        raise HTTPException(status_code=400, detail="Нельзя удалить администратора")
    await session.delete(user)
    await session.commit()
    return {"detail": "User deleted"}


@router.put("/users/{user_id}/role", response_model=AdminUserOut)
async def admin_change_role(
    user_id: int,
    body: RoleUpdate,
    _: User = Depends(require_admin_local),
    session: AsyncSession = Depends(get_db),
):
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    user.role = body.role
    await session.commit()
    await session.refresh(user)
    return _user_out(user)


@router.get("/events/pending", response_model=list[AdminEventOut])
async def admin_pending_events(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    rows = (
        await session.execute(
            select(Event).where(Event.status == "pending").order_by(Event.created_at.desc())
        )
    ).scalars().all()
    return [_event_out(ev) for ev in rows]


@router.get("/events/{event_id}", response_model=EventDetail)
async def admin_get_event(
    event_id: int,
    _: User = Depends(require_admin_local),
    session: AsyncSession = Depends(get_db),
):
    res = await session.execute(
        select(Event)
        .where(Event.id == event_id)
        .options(selectinload(Event.categories), selectinload(Event.ticket_types))
    )
    ev = res.scalar_one_or_none()
    if ev is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return EventDetail.model_validate(event_to_detail_dict(ev))


@router.put("/events/{event_id}/moderate")
async def admin_moderate_event(
    event_id: int,
    body: ModerateEventPayload,
    moderator: User = Depends(require_admin_local),
    session: AsyncSession = Depends(get_db),
):
    ev = await session.get(Event, event_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    if body.decision == "approve":
        ev.status = "approved"
        ev.moderation_reason = None
    else:
        if not (body.reason or "").strip():
            raise HTTPException(status_code=400, detail="Укажите причину отклонения")
        ev.status = "rejected"
        ev.moderation_reason = body.reason.strip()
        if body.block_organizer:
            owner = await session.get(User, ev.organizer_id)
            if owner and owner.role != "admin":
                owner.is_banned = True
    await create_notification(
        session,
        user_id=ev.organizer_id,
        n_type="moderation_status",
        content=moderation_notification_content(ev.title, ev.status, ev.moderation_reason),
        push_title=moderation_push_title(ev.status),
    )
    await session.commit()
    return {"detail": f"Moderated by {moderator.email}", "status": ev.status, "event": _event_out(ev)}


@router.get("/complaints", response_model=list[ComplaintAdminOut])
async def admin_complaints(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    rows = (
        await session.execute(
            select(Complaint, User, Event)
            .outerjoin(User, User.id == Complaint.user_id)
            .outerjoin(Event, Event.id == Complaint.event_id)
            .order_by(Complaint.created_at.desc())
        )
    ).all()
    return [_complaint_out(c, user, ev) for c, user, ev in rows]


@router.put("/complaints/{complaint_id}/resolve", response_model=ComplaintAdminOut)
async def admin_resolve_complaint(
    complaint_id: int,
    body: ResolveComplaintPayload,
    _: User = Depends(require_admin_local),
    session: AsyncSession = Depends(get_db),
):
    complaint = await session.get(Complaint, complaint_id)
    if complaint is None:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    complaint.status = body.decision
    ev = await session.get(Event, complaint.event_id)
    if body.hide_event and ev:
        ev.is_hidden = True
        reason = (complaint.reason or "").strip() or "Событие скрыто по результатам рассмотрения жалобы."
        ev.moderation_reason = reason
        await create_notification(
            session,
            user_id=ev.organizer_id,
            n_type="moderation_status",
            content=moderation_notification_content(ev.title, "rejected", reason),
            push_title=moderation_push_title("rejected"),
        )
    if body.block_organizer and ev:
        owner = await session.get(User, ev.organizer_id)
        if owner and owner.role != "admin":
            owner.is_banned = True
    if ev:
        await create_notification(
            session,
            user_id=complaint.user_id,
            n_type=f"complaint_{complaint.status}",
            content=complaint_notification_content(ev.title, complaint.status),
            push_title=complaint_push_title(complaint.status),
        )
    await session.commit()
    await session.refresh(complaint)
    user = await session.get(User, complaint.user_id)
    ev = await session.get(Event, complaint.event_id)
    return _complaint_out(complaint, user, ev)


@router.get("/dashboard/metrics", response_model=DashboardMetrics)
async def admin_dashboard_metrics(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today = now.date()
    active_today = await session.scalar(
        select(func.count())
        .select_from(Event)
        .where(
            Event.status == "approved",
            Event.is_hidden.is_(False),
            func.date(Event.event_datetime) == today,
        )
    )
    upcoming_events = await session.scalar(
        select(func.count())
        .select_from(Event)
        .where(
            Event.status == "approved",
            Event.is_hidden.is_(False),
            Event.event_datetime >= now,
        )
    )
    pending_events = await session.scalar(
        select(func.count())
        .select_from(Event)
        .where(Event.status == "pending")
    )
    banned_users = await session.scalar(select(func.count()).select_from(User).where(User.is_banned.is_(True)))
    new_complaints = await session.scalar(
        select(func.count()).select_from(Complaint).where(Complaint.status == "pending")
    )
    total_participations = await session.scalar(select(func.count()).select_from(EventParticipation))
    total_reviews = await session.scalar(select(func.count()).select_from(EventReview))
    avg_rating_raw = await session.scalar(
        select(func.avg(Event.average_rating)).where(
            Event.status == "approved",
            Event.is_hidden.is_(False),
            Event.average_rating.is_not(None),
        )
    )
    total_users = await session.scalar(select(func.count()).select_from(User)) or 0
    total_events = await session.scalar(select(func.count()).select_from(Event)) or 0
    active = int(active_today or 0)
    avg_rating = round(float(avg_rating_raw), 1) if avg_rating_raw is not None else None
    return DashboardMetrics(
        total_users=int(total_users),
        total_events=int(total_events),
        active_events_today=active,
        active_events_today_or_future=int(upcoming_events or 0),
        new_complaints=int(new_complaints or 0),
        pending_events=int(pending_events or 0),
        banned_users=int(banned_users or 0),
        upcoming_events=int(upcoming_events or 0),
        total_participations=int(total_participations or 0),
        total_reviews=int(total_reviews or 0),
        avg_event_rating=avg_rating,
    )


@router.get("/dashboard/users-chart", response_model=list[ChartPoint])
async def admin_users_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    out: list[ChartPoint] = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        cnt = await session.scalar(
            select(func.count()).select_from(User).where(User.created_at >= start, User.created_at < end)
        )
        out.append(ChartPoint(label=day.strftime("%d.%m"), count=int(cnt or 0)))
    return out


@router.get("/dashboard/events-chart", response_model=list[ChartPoint])
async def admin_events_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    out: list[ChartPoint] = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        cnt = await session.scalar(
            select(func.count()).select_from(Event).where(Event.created_at >= start, Event.created_at < end)
        )
        out.append(ChartPoint(label=day.strftime("%d.%m"), count=int(cnt or 0)))
    return out


@router.get("/dashboard/complaints-chart", response_model=list[ChartPoint])
async def admin_complaints_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    out: list[ChartPoint] = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).date()
        start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        cnt = await session.scalar(
            select(func.count()).select_from(Complaint).where(Complaint.created_at >= start, Complaint.created_at < end)
        )
        out.append(ChartPoint(label=day.strftime("%d.%m"), count=int(cnt or 0)))
    return out
