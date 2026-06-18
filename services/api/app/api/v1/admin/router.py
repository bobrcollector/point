from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.admin.dashboard_charts import (
    APPROVED_VISIBLE,
    complaints_chart,
    complaints_total_chart,
    conversion_chart,
    count_event_views,
    events_chart,
    low_rated_events_chart,
    participations_chart,
    participations_per_event_chart,
    rating_chart,
    repeat_participants_chart,
    review_leave_chart,
    users_chart,
    users_total_chart,
)
from app.api.v1.admin.schemas import (
    AdminEventOut,
    AdminUserOut,
    ChartPoint,
    ComplaintAdminOut,
    DashboardMetrics,
    RatingChartPoint,
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
    total_complaints = await session.scalar(select(func.count()).select_from(Complaint))
    today_start = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc)
    today_end = today_start + timedelta(days=1)
    complaints_today = await session.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(Complaint.created_at >= today_start, Complaint.created_at < today_end)
    )
    total_participations = await session.scalar(select(func.count()).select_from(EventParticipation))
    events_created_today = await session.scalar(
        select(func.count()).select_from(Event).where(Event.created_at >= today_start, Event.created_at < today_end)
    )
    participations_today = await session.scalar(
        select(func.count())
        .select_from(EventParticipation)
        .where(EventParticipation.created_at >= today_start, EventParticipation.created_at < today_end)
    )
    total_reviews = await session.scalar(select(func.count()).select_from(EventReview))
    avg_rating_raw = await session.scalar(
        select(func.avg(Event.average_rating)).where(
            Event.status == "approved",
            Event.is_hidden.is_(False),
            Event.average_rating.is_not(None),
        )
    )
    avg_review_rating_raw = await session.scalar(select(func.avg(EventReview.rating)))
    participations_count = int(total_participations or 0)
    reviews_count = int(total_reviews or 0)
    review_leave_percent = (
        round(100.0 * reviews_count / participations_count, 1) if participations_count > 0 else None
    )
    total_users = await session.scalar(select(func.count()).select_from(User)) or 0
    users_registered_today = await session.scalar(
        select(func.count()).select_from(User).where(User.created_at >= today_start, User.created_at < today_end)
    )
    total_events = await session.scalar(select(func.count()).select_from(Event)) or 0
    active = int(active_today or 0)
    avg_rating = round(float(avg_rating_raw), 1) if avg_rating_raw is not None else None
    avg_review_rating = (
        round(float(avg_review_rating_raw), 1) if avg_review_rating_raw is not None else None
    )

    total_views = await count_event_views(session)
    view_to_participation_percent = (
        round(100.0 * participations_count / int(total_views), 1) if total_views else None
    )

    active_events = int(upcoming_events or 0)
    participations_on_active = await session.scalar(
        select(func.count())
        .select_from(EventParticipation)
        .join(Event, Event.id == EventParticipation.event_id)
        .where(*APPROVED_VISIBLE, Event.event_datetime >= now)
    )
    participations_per_active_event = (
        round(float(participations_on_active or 0) / active_events, 1) if active_events > 0 else None
    )

    users_with_participation = await session.scalar(
        select(func.count(func.distinct(EventParticipation.user_id)))
    )
    repeat_participants = await session.scalar(
        select(func.count())
        .select_from(
            select(EventParticipation.user_id)
            .group_by(EventParticipation.user_id)
            .having(func.count() >= 2)
            .subquery()
        )
    )
    repeat_participants_percent = (
        round(100.0 * int(repeat_participants or 0) / int(users_with_participation), 1)
        if users_with_participation
        else None
    )

    rated_events = await session.scalar(
        select(func.count())
        .select_from(Event)
        .where(*APPROVED_VISIBLE, Event.average_rating.is_not(None))
    )
    low_rated_events = await session.scalar(
        select(func.count())
        .select_from(Event)
        .where(*APPROVED_VISIBLE, Event.average_rating.is_not(None), Event.average_rating < 3)
    )
    low_rated_events_percent = (
        round(100.0 * int(low_rated_events or 0) / int(rated_events), 1) if rated_events else None
    )

    return DashboardMetrics(
        total_users=int(total_users),
        users_registered_today=int(users_registered_today or 0),
        total_events=int(total_events),
        active_events_today=active,
        active_events_today_or_future=int(upcoming_events or 0),
        new_complaints=int(new_complaints or 0),
        total_complaints=int(total_complaints or 0),
        complaints_today=int(complaints_today or 0),
        pending_events=int(pending_events or 0),
        banned_users=int(banned_users or 0),
        upcoming_events=int(upcoming_events or 0),
        total_participations=int(total_participations or 0),
        events_created_today=int(events_created_today or 0),
        participations_today=int(participations_today or 0),
        total_reviews=int(total_reviews or 0),
        avg_event_rating=avg_rating,
        avg_review_rating=avg_review_rating,
        review_leave_percent=review_leave_percent,
        view_to_participation_percent=view_to_participation_percent,
        participations_per_active_event=participations_per_active_event,
        repeat_participants_percent=repeat_participants_percent,
        low_rated_events_percent=low_rated_events_percent,
    )


@router.get("/dashboard/users-chart", response_model=list[ChartPoint])
async def admin_users_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await users_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/users-total-chart", response_model=list[ChartPoint])
async def admin_users_total_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await users_total_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/events-chart", response_model=list[ChartPoint])
async def admin_events_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await events_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/participations-chart", response_model=list[ChartPoint])
async def admin_participations_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await participations_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/complaints-chart", response_model=list[ChartPoint])
async def admin_complaints_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await complaints_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/complaints-total-chart", response_model=list[ChartPoint])
async def admin_complaints_total_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await complaints_total_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/rating-chart", response_model=list[RatingChartPoint])
async def admin_rating_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await rating_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/conversion-chart", response_model=list[RatingChartPoint])
async def admin_conversion_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await conversion_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/participations-per-event-chart", response_model=list[RatingChartPoint])
async def admin_participations_per_event_chart(
    _: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)
):
    return await participations_per_event_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/repeat-participants-chart", response_model=list[RatingChartPoint])
async def admin_repeat_participants_chart(
    _: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)
):
    return await repeat_participants_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/low-rated-events-chart", response_model=list[RatingChartPoint])
async def admin_low_rated_events_chart(
    _: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)
):
    return await low_rated_events_chart(session, datetime.now(timezone.utc))


@router.get("/dashboard/review-leave-chart", response_model=list[RatingChartPoint])
async def admin_review_leave_chart(_: User = Depends(require_admin_local), session: AsyncSession = Depends(get_db)):
    return await review_leave_chart(session, datetime.now(timezone.utc))
