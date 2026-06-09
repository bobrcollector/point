from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.catalog import service as catalog_service
from app.api.v1.catalog.schemas import (
    CategoriesResponse,
    EventDetail,
    EventInteractionOut,
    EventInteractionState,
    EventInteractionUpdate,
    EventReviewCreate,
    EventReviewOut,
    EventsResponse,
)
from app.core.deps import get_current_user, get_current_user_optional
from app.db.session import get_db
from app.models import Event, EventFavorite, EventParticipation, EventReview, User

router = APIRouter()


async def _get_public_event(session: AsyncSession, event_id: int) -> Event:
    ev = await session.get(Event, event_id)
    if ev is None or ev.is_hidden or ev.status != "approved":
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return ev


def _review_out(row: EventReview) -> EventReviewOut:
    created_at = row.created_at.isoformat() if row.created_at else ""
    return EventReviewOut(
        review_id=row.id,
        event_id=row.event_id,
        user_id=row.user_id,
        author=row.author,
        text=row.text,
        rating=row.rating,
        created_at=created_at,
    )


@router.get("/events", response_model=EventsResponse)
async def get_events(
    session: AsyncSession = Depends(get_db),
    lat: float | None = None,
    lon: float | None = None,
    radius: int | None = None,
    bounds: str | None = None,
    category_ids: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    price_min: float | None = None,
    price_max: float | None = None,
    for_children: bool = False,
    age_ratings: str | None = None,
    sort_by: str = "distance",
    limit: int = 20,
    offset: int = 0,
):
    rows = await catalog_service.load_all_events(session)
    filtered = catalog_service.filter_and_sort_events(
        rows,
        lat=lat,
        lon=lon,
        radius_m=radius,
        category_ids=catalog_service.parse_category_ids(category_ids),
        bounds=catalog_service.parse_bounds(bounds),
        date_from=catalog_service.parse_iso_datetime(date_from),
        date_to=catalog_service.parse_iso_datetime(date_to),
        price_min=price_min,
        price_max=price_max,
        for_children=for_children or None,
        age_ratings=catalog_service.parse_age_ratings(age_ratings),
        sort_by=sort_by,
    )
    total = len(filtered)
    page = filtered[offset : offset + limit]
    items = [catalog_service.event_to_item_dict(ev, dist) for ev, dist in page]
    return {"total": total, "items": items}


@router.get("/me/interactions", response_model=EventInteractionState)
async def get_my_event_interactions(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    favorites = (
        await session.execute(
            select(EventFavorite.event_id)
            .join(Event, Event.id == EventFavorite.event_id)
            .where(
                EventFavorite.user_id == user.id,
                Event.status == "approved",
                Event.is_hidden.is_(False),
            )
            .order_by(EventFavorite.created_at.desc())
        )
    ).scalars().all()
    participations = (
        await session.execute(
            select(EventParticipation.event_id)
            .join(Event, Event.id == EventParticipation.event_id)
            .where(EventParticipation.user_id == user.id, Event.is_hidden.is_(False))
            .order_by(EventParticipation.created_at.desc())
        )
    ).scalars().all()
    return {
        "favorite_event_ids": list(favorites),
        "participating_event_ids": list(participations),
    }


@router.get("/me/participating-events", response_model=EventsResponse)
async def get_my_participating_events(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    rows = (
        await session.execute(
            select(Event)
            .join(EventParticipation, EventParticipation.event_id == Event.id)
            .where(EventParticipation.user_id == user.id, Event.is_hidden.is_(False))
            .options(selectinload(Event.categories), selectinload(Event.ticket_types))
            .order_by(EventParticipation.created_at.desc())
        )
    ).scalars().all()
    items = [catalog_service.event_to_item_dict(ev, None) for ev in rows]
    return {"total": len(items), "items": items}


@router.put("/events/{event_id}/favorite", response_model=EventInteractionOut)
async def set_event_favorite(
    event_id: int,
    body: EventInteractionUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    await _get_public_event(session, event_id)
    existing = await session.scalar(
        select(EventFavorite).where(EventFavorite.user_id == user.id, EventFavorite.event_id == event_id)
    )
    if body.enabled and existing is None:
        session.add(EventFavorite(user_id=user.id, event_id=event_id))
    elif not body.enabled and existing is not None:
        await session.delete(existing)
    await session.commit()
    participating = await session.scalar(
        select(EventParticipation).where(EventParticipation.user_id == user.id, EventParticipation.event_id == event_id)
    )
    return {
        "event_id": event_id,
        "is_favorite": body.enabled,
        "is_participating": participating is not None,
    }


@router.put("/events/{event_id}/participation", response_model=EventInteractionOut)
async def set_event_participation(
    event_id: int,
    body: EventInteractionUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ev = await _get_public_event(session, event_id)
    existing = await session.scalar(
        select(EventParticipation).where(EventParticipation.user_id == user.id, EventParticipation.event_id == event_id)
    )
    if body.enabled and existing is None:
        session.add(EventParticipation(user_id=user.id, event_id=event_id))
        ev.participants_count = int(ev.participants_count or 0) + 1
    elif not body.enabled and existing is not None:
        await session.delete(existing)
        ev.participants_count = max(0, int(ev.participants_count or 0) - 1)
    await session.commit()
    favorite = await session.scalar(
        select(EventFavorite).where(EventFavorite.user_id == user.id, EventFavorite.event_id == event_id)
    )
    return {
        "event_id": event_id,
        "is_favorite": favorite is not None,
        "is_participating": body.enabled,
    }


@router.get("/events/{event_id}/reviews", response_model=list[EventReviewOut])
async def list_event_reviews(event_id: int, session: AsyncSession = Depends(get_db)):
    await _get_public_event(session, event_id)
    rows = (
        await session.execute(
            select(EventReview).where(EventReview.event_id == event_id).order_by(EventReview.created_at.desc())
        )
    ).scalars().all()
    return [_review_out(row) for row in rows]


@router.post("/events/{event_id}/reviews", response_model=EventReviewOut, status_code=201)
async def create_event_review(
    event_id: int,
    body: EventReviewCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    ev = await _get_public_event(session, event_id)
    participating = await session.scalar(
        select(EventParticipation).where(EventParticipation.user_id == user.id, EventParticipation.event_id == event_id)
    )
    if participating is None:
        raise HTTPException(status_code=400, detail="Оставить отзыв можно только после участия в событии")
    existing = await session.scalar(
        select(EventReview).where(EventReview.user_id == user.id, EventReview.event_id == event_id)
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="Вы уже оставили отзыв на это событие")
    row = EventReview(
        event_id=event_id,
        user_id=user.id,
        author=user.display_name,
        text=body.text.strip(),
        rating=body.rating,
    )
    session.add(row)
    await session.flush()
    avg = await session.scalar(select(func.avg(EventReview.rating)).where(EventReview.event_id == event_id))
    ev.average_rating = float(avg or body.rating)
    await session.commit()
    await session.refresh(row)
    return _review_out(row)


@router.get("/events/{event_id}", response_model=EventDetail)
async def get_event_detail(
    event_id: int,
    session: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    ev = await catalog_service.get_event_by_id(session, event_id)
    if ev is None and user is not None:
        ev = await catalog_service.get_event_for_participant(session, event_id, user.id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return EventDetail.model_validate(catalog_service.event_to_detail_dict(ev))


@router.get("/categories", response_model=CategoriesResponse)
async def get_categories(session: AsyncSession = Depends(get_db)):
    items = await catalog_service.list_categories_payload(session)
    return {"items": items}
