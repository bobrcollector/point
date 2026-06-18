from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.admin.schemas import ChartPoint, RatingChartPoint
from app.models import Complaint, Event, EventParticipation, EventReview, EventView, User

CHART_DAYS = 30
APPROVED_VISIBLE = (Event.status == "approved", Event.is_hidden.is_(False))


def iter_chart_days(now: datetime):
    for i in range(CHART_DAYS - 1, -1, -1):
        day = (now - timedelta(days=i)).date()
        start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        yield day.strftime("%d.%m"), start, end


async def safe_scalar(session: AsyncSession, stmt, default=0):
    try:
        val = await session.scalar(stmt)
        return default if val is None else val
    except DBAPIError:
        await session.rollback()
        return default


async def count_event_views(session: AsyncSession, *where) -> int:
    stmt = (
        select(func.count())
        .select_from(EventView)
        .join(Event, Event.id == EventView.event_id)
        .where(*APPROVED_VISIBLE, *where)
    )
    return int(await safe_scalar(session, stmt, 0))


async def users_chart(session: AsyncSession, now: datetime) -> list[ChartPoint]:
    out: list[ChartPoint] = []
    for label, start, end in iter_chart_days(now):
        cnt = await session.scalar(
            select(func.count()).select_from(User).where(User.created_at >= start, User.created_at < end)
        )
        out.append(ChartPoint(label=label, count=int(cnt or 0)))
    return out


async def users_total_chart(session: AsyncSession, now: datetime) -> list[ChartPoint]:
    out: list[ChartPoint] = []
    for label, start, end in iter_chart_days(now):
        cnt = await session.scalar(select(func.count()).select_from(User).where(User.created_at < end))
        out.append(ChartPoint(label=label, count=int(cnt or 0)))
    return out


async def events_chart(session: AsyncSession, now: datetime) -> list[ChartPoint]:
    out: list[ChartPoint] = []
    for label, start, end in iter_chart_days(now):
        cnt = await session.scalar(
            select(func.count()).select_from(Event).where(Event.created_at >= start, Event.created_at < end)
        )
        out.append(ChartPoint(label=label, count=int(cnt or 0)))
    return out


async def participations_chart(session: AsyncSession, now: datetime) -> list[ChartPoint]:
    out: list[ChartPoint] = []
    for label, start, end in iter_chart_days(now):
        cnt = await session.scalar(
            select(func.count())
            .select_from(EventParticipation)
            .where(EventParticipation.created_at >= start, EventParticipation.created_at < end)
        )
        out.append(ChartPoint(label=label, count=int(cnt or 0)))
    return out


async def complaints_chart(session: AsyncSession, now: datetime) -> list[ChartPoint]:
    out: list[ChartPoint] = []
    for label, start, end in iter_chart_days(now):
        cnt = await session.scalar(
            select(func.count()).select_from(Complaint).where(Complaint.created_at >= start, Complaint.created_at < end)
        )
        out.append(ChartPoint(label=label, count=int(cnt or 0)))
    return out


async def complaints_total_chart(session: AsyncSession, now: datetime) -> list[ChartPoint]:
    out: list[ChartPoint] = []
    for label, start, end in iter_chart_days(now):
        cnt = await session.scalar(select(func.count()).select_from(Complaint).where(Complaint.created_at < end))
        out.append(ChartPoint(label=label, count=int(cnt or 0)))
    return out


async def rating_chart(session: AsyncSession, now: datetime) -> list[RatingChartPoint]:
    out: list[RatingChartPoint] = []
    for label, start, end in iter_chart_days(now):
        avg_raw = await session.scalar(
            select(func.avg(EventReview.rating)).where(
                EventReview.created_at >= start,
                EventReview.created_at < end,
            )
        )
        value = round(float(avg_raw), 1) if avg_raw is not None else None
        out.append(RatingChartPoint(label=label, value=value))
    return out


async def conversion_chart(session: AsyncSession, now: datetime) -> list[RatingChartPoint]:
    out: list[RatingChartPoint] = []
    for label, start, end in iter_chart_days(now):
        views = await count_event_views(
            session,
            EventView.created_at >= start,
            EventView.created_at < end,
        )
        parts = await session.scalar(
            select(func.count())
            .select_from(EventParticipation)
            .where(EventParticipation.created_at >= start, EventParticipation.created_at < end)
        )
        parts_n = int(parts or 0)
        value = round(100.0 * parts_n / int(views), 1) if views else None
        out.append(RatingChartPoint(label=label, value=value))
    return out


async def participations_per_event_chart(session: AsyncSession, now: datetime) -> list[RatingChartPoint]:
    out: list[RatingChartPoint] = []
    for label, start, end in iter_chart_days(now):
        active_events = await session.scalar(
            select(func.count())
            .select_from(Event)
            .where(*APPROVED_VISIBLE, Event.event_datetime >= end)
        )
        active_n = int(active_events or 0)
        parts = await session.scalar(
            select(func.count())
            .select_from(EventParticipation)
            .join(Event, Event.id == EventParticipation.event_id)
            .where(
                *APPROVED_VISIBLE,
                Event.event_datetime >= end,
                EventParticipation.created_at >= start,
                EventParticipation.created_at < end,
            )
        )
        value = round(float(parts or 0) / active_n, 1) if active_n > 0 else None
        out.append(RatingChartPoint(label=label, value=value))
    return out


async def repeat_participants_chart(session: AsyncSession, now: datetime) -> list[RatingChartPoint]:
    out: list[RatingChartPoint] = []
    for label, start, end in iter_chart_days(now):
        users_with = await session.scalar(
            select(func.count(func.distinct(EventParticipation.user_id))).where(
                EventParticipation.created_at < end
            )
        )
        repeat = await session.scalar(
            select(func.count())
            .select_from(
                select(EventParticipation.user_id)
                .where(EventParticipation.created_at < end)
                .group_by(EventParticipation.user_id)
                .having(func.count() >= 2)
                .subquery()
            )
        )
        users_n = int(users_with or 0)
        value = round(100.0 * int(repeat or 0) / users_n, 1) if users_n > 0 else None
        out.append(RatingChartPoint(label=label, value=value))
    return out


async def low_rated_events_chart(session: AsyncSession, now: datetime) -> list[RatingChartPoint]:
    out: list[RatingChartPoint] = []
    for label, start, end in iter_chart_days(now):
        rated = await session.scalar(
            select(func.count())
            .select_from(Event)
            .where(*APPROVED_VISIBLE, Event.average_rating.is_not(None), Event.created_at < end)
        )
        low = await session.scalar(
            select(func.count())
            .select_from(Event)
            .where(
                *APPROVED_VISIBLE,
                Event.average_rating.is_not(None),
                Event.average_rating < 3,
                Event.created_at < end,
            )
        )
        rated_n = int(rated or 0)
        value = round(100.0 * int(low or 0) / rated_n, 1) if rated_n > 0 else None
        out.append(RatingChartPoint(label=label, value=value))
    return out


async def review_leave_chart(session: AsyncSession, now: datetime) -> list[RatingChartPoint]:
    out: list[RatingChartPoint] = []
    for label, start, end in iter_chart_days(now):
        parts = await session.scalar(
            select(func.count())
            .select_from(EventParticipation)
            .where(EventParticipation.created_at >= start, EventParticipation.created_at < end)
        )
        reviews = await session.scalar(
            select(func.count())
            .select_from(EventReview)
            .where(EventReview.created_at >= start, EventReview.created_at < end)
        )
        parts_n = int(parts or 0)
        value = round(100.0 * int(reviews or 0) / parts_n, 1) if parts_n > 0 else None
        out.append(RatingChartPoint(label=label, value=value))
    return out
