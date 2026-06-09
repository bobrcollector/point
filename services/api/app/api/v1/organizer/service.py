from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.organizer.schemas import EventCreateIn, EventUpdateIn, TicketTypeIn
from app.core.media import abs_media_url
from app.models import Category, Event, EventTicketType, User


def _min_ticket_price(tickets: list[EventTicketType]) -> float:
    if not tickets:
        return 0.0
    return float(min(t.price for t in tickets))


def _event_to_list_item(ev: Event) -> dict:
    return {
        "event_id": ev.id,
        "title": ev.title,
        "event_datetime": ev.event_datetime,
        "location": ev.location,
        "status": ev.status,
        "is_hidden": bool(ev.is_hidden),
        "moderation_reason": ev.moderation_reason,
        "price": float(ev.price),
        "cover_image_url": abs_media_url(ev.cover_image_url),
        "categories": [{"id": c.id, "name": c.name} for c in ev.categories],
        "ticket_types_count": len(ev.ticket_types),
    }


def _event_to_detail(ev: Event) -> dict:
    g = ev.gallery_urls if isinstance(ev.gallery_urls, list) else []
    return {
        "event_id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "location": ev.location,
        "address_detail": ev.address_detail,
        "event_datetime": ev.event_datetime,
        "status": ev.status,
        "is_hidden": bool(ev.is_hidden),
        "moderation_reason": ev.moderation_reason,
        "price": float(ev.price),
        "cover_image_url": abs_media_url(ev.cover_image_url),
        "gallery_urls": [u for u in (abs_media_url(str(x)) for x in g) if u],
        "latitude": float(ev.latitude) if ev.latitude is not None else None,
        "longitude": float(ev.longitude) if ev.longitude is not None else None,
        "is_for_children": bool(ev.is_for_children),
        "age_rating_min": int(ev.age_rating_min),
        "requires_registration": bool(ev.requires_registration),
        "participants_count": int(ev.participants_count or 0),
        "organizer_name": ev.organizer_name,
        "category_ids": [c.id for c in ev.categories],
        "categories": [{"id": c.id, "name": c.name} for c in ev.categories],
        "ticket_types": [
            {
                "id": t.id,
                "name": t.name,
                "price": float(t.price),
                "quantity": int(t.quantity),
                "sort_order": int(t.sort_order),
            }
            for t in ev.ticket_types
        ],
        "created_at": ev.created_at,
        "updated_at": ev.updated_at,
    }


async def _load_categories(session: AsyncSession, ids: list[int]) -> list[Category]:
    if not ids:
        raise HTTPException(status_code=400, detail="Укажите хотя бы одну категорию")
    res = await session.execute(select(Category).where(Category.id.in_(ids)))
    cats = list(res.scalars())
    if len(cats) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Неизвестная категория")
    return cats


def _apply_tickets(ev: Event, rows: list[TicketTypeIn]) -> None:
    ev.ticket_types.clear()
    for i, row in enumerate(rows):
        ev.ticket_types.append(
            EventTicketType(
                name=row.name,
                price=row.price,
                quantity=row.quantity,
                sort_order=row.sort_order if row.sort_order else i,
            )
        )
    ev.price = _min_ticket_price(ev.ticket_types)


async def list_organizer_events(session: AsyncSession, organizer_id: int) -> list[Event]:
    res = await session.execute(
        select(Event)
        .where(Event.organizer_id == organizer_id)
        .options(selectinload(Event.categories), selectinload(Event.ticket_types))
        .order_by(Event.event_datetime.desc())
    )
    return list(res.scalars())


async def get_organizer_event(session: AsyncSession, organizer_id: int, event_id: int) -> Event:
    res = await session.execute(
        select(Event)
        .where(Event.id == event_id, Event.organizer_id == organizer_id)
        .options(selectinload(Event.categories), selectinload(Event.ticket_types))
    )
    ev = res.scalar_one_or_none()
    if ev is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return ev


async def create_event(session: AsyncSession, organizer_id: int, payload: EventCreateIn) -> Event:
    user = await session.get(User, organizer_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Организатор не найден")

    cats = await _load_categories(session, payload.category_ids)
    ev = Event(
        organizer_id=organizer_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        location=payload.location.strip(),
        address_detail=(payload.address_detail or "").strip(),
        event_datetime=payload.event_datetime,
        organizer_name=user.display_name,
        cover_image_url=payload.cover_image_url,
        latitude=payload.latitude,
        longitude=payload.longitude,
        gallery_urls=payload.gallery_urls,
        is_for_children=payload.is_for_children,
        age_rating_min=payload.age_rating_min,
        requires_registration=payload.requires_registration,
        status=payload.status,
        price=0,
    )
    ev.categories = cats
    _apply_tickets(ev, payload.ticket_types)
    session.add(ev)
    await session.flush()
    await session.refresh(ev, ["categories", "ticket_types"])
    return ev


async def update_event(
    session: AsyncSession, organizer_id: int, event_id: int, payload: EventUpdateIn
) -> Event:
    ev = await get_organizer_event(session, organizer_id, event_id)
    data = payload.model_dump(exclude_unset=True)
    ticket_rows = data.pop("ticket_types", None)
    category_ids = data.pop("category_ids", None)
    # Статус меняют только publish / модерация / finish — не PATCH из формы редактирования.
    data.pop("status", None)

    for key, value in data.items():
        if key == "title" and value is not None:
            setattr(ev, key, str(value).strip())
        elif key in ("description", "location", "address_detail") and value is not None:
            setattr(ev, key, str(value).strip())
        else:
            setattr(ev, key, value)

    if category_ids is not None:
        ev.categories = await _load_categories(session, category_ids)

    if ticket_rows is not None:
        _apply_tickets(ev, [TicketTypeIn.model_validate(t) for t in ticket_rows])

    ev.updated_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(ev, ["categories", "ticket_types"])
    return ev


async def delete_event(session: AsyncSession, organizer_id: int, event_id: int) -> None:
    ev = await get_organizer_event(session, organizer_id, event_id)
    await session.delete(ev)


async def publish_event(session: AsyncSession, organizer_id: int, event_id: int) -> Event:
    ev = await get_organizer_event(session, organizer_id, event_id)
    if len(ev.title.strip()) < 2:
        raise HTTPException(status_code=400, detail="Укажите название (минимум 2 символа)")
    if len(ev.description.strip()) < 10:
        raise HTTPException(status_code=400, detail="Добавьте описание события")
    if not ev.location.strip():
        raise HTTPException(status_code=400, detail="Укажите место проведения")
    if ev.latitude is None or ev.longitude is None:
        raise HTTPException(status_code=400, detail="Отметьте место на карте")
    if not ev.categories:
        raise HTTPException(status_code=400, detail="Выберите категорию")
    now = datetime.now(timezone.utc)
    dt = ev.event_datetime
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    if dt < now:
        raise HTTPException(status_code=400, detail="Дата события должна быть в будущем")
    if ev.requires_registration:
        named = [t for t in ev.ticket_types if t.name.strip()]
        if not named:
            raise HTTPException(status_code=400, detail="Добавьте хотя бы один тип билета")
    ev.status = "pending"
    ev.moderation_reason = None
    ev.is_hidden = False
    ev.updated_at = now
    await session.flush()
    return ev


async def finish_event(session: AsyncSession, organizer_id: int, event_id: int) -> Event:
    ev = await get_organizer_event(session, organizer_id, event_id)
    if ev.status not in ("approved", "pending"):
        raise HTTPException(
            status_code=400,
            detail="Завершить можно только опубликованное или ожидающее модерации событие",
        )
    now = datetime.now(timezone.utc)
    ev.status = "archived"
    ev.is_hidden = True
    ev.updated_at = now
    await session.flush()
    await session.refresh(ev, ["categories", "ticket_types"])
    return ev
