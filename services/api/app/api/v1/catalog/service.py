from __future__ import annotations

import math
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import Category, Event

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def parse_bounds(raw: str | None) -> tuple[float, float, float, float] | None:
    if not raw:
        return None
    parts = raw.split(",")
    if len(parts) != 4:
        return None
    try:
        nums = [float(x.strip()) for x in parts]
        return nums[0], nums[1], nums[2], nums[3]
    except ValueError:
        return None


def parse_age_ratings(raw: str | None) -> set[int] | None:
    if not raw or not raw.strip():
        return None
    allowed = {0, 6, 12, 16, 18}
    out: set[int] = set()
    for part in raw.split(","):
        p = part.strip()
        if p.isdigit():
            n = int(p)
            if n in allowed:
                out.add(n)
    return out or None


def parse_category_ids(raw: str | None) -> set[int] | None:
    if not raw or not raw.strip():
        return None
    out: set[int] = set()
    for part in raw.split(","):
        p = part.strip()
        if p.isdigit():
            out.add(int(p))
    return out or None


def parse_iso_datetime(raw: str | None) -> datetime | None:
    if not raw or not raw.strip():
        return None
    try:
        return datetime.fromisoformat(raw.strip().replace("Z", "+00:00"))
    except ValueError:
        return None


def _event_in_bounds(ev: Event, b: tuple[float, float, float, float]) -> bool:
    min_lon, min_lat, max_lon, max_lat = b
    if ev.latitude is None or ev.longitude is None:
        return False
    lat, lon = float(ev.latitude), float(ev.longitude)
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


def event_distance_m(ev: Event, lat: float, lon: float) -> int | None:
    if ev.latitude is None or ev.longitude is None:
        return None
    return int(haversine_m(lat, lon, float(ev.latitude), float(ev.longitude)))


async def load_all_events(session: AsyncSession) -> list[Event]:
    res = await session.execute(
        select(Event)
        .where(Event.status == "published")
        .options(selectinload(Event.categories))
        .order_by(Event.event_datetime)
    )
    return list(res.scalars())


async def list_categories_payload(session: AsyncSession) -> list[dict[str, int | str]]:
    res = await session.execute(select(Category).order_by(Category.id))
    return [{"id": c.id, "name": c.name} for c in res.scalars()]


def filter_and_sort_events(
    rows: list[Event],
    *,
    lat: float | None,
    lon: float | None,
    radius_m: int | None,
    category_ids: set[int] | None,
    bounds: tuple[float, float, float, float] | None,
    date_from: datetime | None,
    date_to: datetime | None,
    price_min: float | None,
    price_max: float | None,
    for_children: bool | None,
    age_ratings: set[int] | None,
    sort_by: str,
) -> list[tuple[Event, int | None]]:
    scored: list[tuple[Event, int | None]] = []
    has_geo = lat is not None and lon is not None

    for ev in rows:
        if category_ids is not None:
            ev_cats = {c.id for c in ev.categories}
            if ev_cats.isdisjoint(category_ids):
                continue
        # Учитываем рамку только если у события есть координаты; иначе «вне рамки» не вычислить —
        # иначе при bounds все без координат пропадали из выдачи (лента полная, карта пустая).
        if bounds is not None and ev.latitude is not None and ev.longitude is not None:
            if not _event_in_bounds(ev, bounds):
                continue
        if date_from is not None and ev.event_datetime < date_from:
            continue
        if date_to is not None and ev.event_datetime > date_to:
            continue
        price = float(ev.price)
        if price_min is not None and price < price_min:
            continue
        if price_max is not None and price > price_max:
            continue
        if for_children and not ev.is_for_children:
            continue
        if age_ratings is not None and int(ev.age_rating_min) not in age_ratings:
            continue
        dist: int | None = None
        if has_geo:
            dist = event_distance_m(ev, float(lat), float(lon))
            if radius_m is not None and (dist is None or dist > radius_m):
                continue
        scored.append((ev, dist))

    if sort_by == "rating":
        scored.sort(key=lambda t: t[0].average_rating or 0, reverse=True)
    elif sort_by == "rank":
        if has_geo:
            scored.sort(key=lambda t: t[1] if t[1] is not None else 10**12)
        else:
            scored.sort(key=lambda t: t[0].average_rating or 0, reverse=True)
    elif sort_by == "distance" and has_geo:
        scored.sort(key=lambda t: t[1] if t[1] is not None else 10**12)
    elif sort_by == "date":
        scored.sort(key=lambda t: t[0].event_datetime)
    else:
        if has_geo:
            scored.sort(key=lambda t: t[1] if t[1] is not None else 10**12)
        else:
            scored.sort(key=lambda t: t[0].event_datetime)

    return scored


def event_to_item_dict(ev: Event, distance: int | None) -> dict[str, object]:
    return {
        "event_id": ev.id,
        "title": ev.title,
        "event_datetime": ev.event_datetime.isoformat(),
        "location": ev.location,
        "price": float(ev.price),
        "average_rating": float(ev.average_rating) if ev.average_rating is not None else None,
        "cover_image_url": ev.cover_image_url,
        "latitude": float(ev.latitude) if ev.latitude is not None else None,
        "longitude": float(ev.longitude) if ev.longitude is not None else None,
        "distance": distance,
        "is_for_children": bool(ev.is_for_children),
        "age_rating_min": int(ev.age_rating_min),
        "categories": [{"id": c.id, "name": c.name} for c in ev.categories],
    }


def event_to_detail_dict(ev: Event) -> dict[str, object]:
    base = event_to_item_dict(ev, None)
    g = ev.gallery_urls
    urls: list[str]
    if isinstance(g, list):
        urls = [str(x) for x in g]
    else:
        urls = []
    base.update(
        {
            "description": ev.description,
            "address_detail": ev.address_detail,
            "organizer_name": ev.organizer_name,
            "gallery_urls": urls,
            "participants_count": int(ev.participants_count),
            "requires_registration": bool(ev.requires_registration),
            "ticket_types": [
                {
                    "id": t.id,
                    "name": t.name,
                    "price": float(t.price),
                    "quantity": int(t.quantity),
                }
                for t in sorted(ev.ticket_types, key=lambda x: (x.sort_order, x.id))
            ],
        }
    )
    return base


async def get_event_by_id(session: AsyncSession, event_id: int) -> Event | None:
    res = await session.execute(
        select(Event)
        .where(Event.id == event_id, Event.status == "published")
        .options(selectinload(Event.categories), selectinload(Event.ticket_types))
    )
    return res.scalar_one_or_none()
