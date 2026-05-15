from __future__ import annotations

from datetime import datetime

from sqlalchemy import select, text

from app.db.session import AsyncSessionLocal
from app.models import Category, Event, User
from app.seed.data import CATEGORY_SEEDS, EVENT_SEEDS


def _cover_url(eid: int, raw: dict[str, object]) -> str:
    cover = raw.get("cover_image_url")
    if cover:
        return str(cover)
    return f"https://picsum.photos/seed/point{eid}/1200/800"


def _detail_fields(eid: int, title: str, venue: str) -> tuple[str, str, str, list[str], int]:
    description = (
        f"«{title}» — живое офлайн-мероприятие на площадке «{venue}». "
        "На странице собраны дата и время, точка на карте и контакты организатора. "
        "Вы можете отметить участие, написать в чат другим гостям и оставить отзыв после события."
    )
    address_detail = f"{venue}, Москва — вход по электронному билету или списку участников."
    organizer_name = "Point Community" if eid % 2 == 0 else "Городские инициативы"
    gallery_urls = [
        f"https://picsum.photos/seed/point{eid}a/1200/800",
        f"https://picsum.photos/seed/point{eid}b/1200/800",
        f"https://picsum.photos/seed/point{eid}c/1200/800",
    ]
    participants_count = 18 + (eid % 55)
    return description, address_detail, organizer_name, gallery_urls, participants_count


async def _backfill_covers(session) -> int:
    events = (await session.execute(select(Event).where(Event.cover_image_url.is_(None)))).scalars().all()
    for ev in events:
        ev.cover_image_url = f"https://picsum.photos/seed/point{ev.id}/1200/800"
    return len(events)


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(Event.id).where(Event.id == 101))
        if existing is not None:
            updated = await _backfill_covers(session)
            if updated:
                await session.commit()
                print(f"Seed: backfilled cover_image_url for {updated} events.")
            else:
                print("Seed skipped: demo data already present (event id=101).")
            return

        dev_user = User(email="dev@point.local", display_name="Point Dev", password_hash=None)
        session.add(dev_user)
        await session.flush()

        for row in CATEGORY_SEEDS:
            session.add(Category(id=int(row["id"]), name=str(row["name"])))
        await session.flush()

        cats = {c.id: c for c in (await session.execute(select(Category))).scalars().all()}

        for raw in EVENT_SEEDS:
            eid = int(raw["id"])
            title = str(raw["title"])
            venue = str(raw["location"])
            desc, addr, org_name, gallery, p_count = _detail_fields(eid, title, venue)
            cat_id = int(raw["category_id"])
            ev = Event(
                id=eid,
                organizer_id=int(dev_user.id),
                title=title,
                event_datetime=datetime.fromisoformat(str(raw["event_datetime"])),
                location=venue,
                address_detail=addr,
                description=desc,
                organizer_name=org_name,
                price=float(raw["price"]),
                average_rating=float(raw["average_rating"]) if raw["average_rating"] is not None else None,
                cover_image_url=_cover_url(eid, raw),
                latitude=float(raw["latitude"]) if raw.get("latitude") is not None else None,
                longitude=float(raw["longitude"]) if raw.get("longitude") is not None else None,
                gallery_urls=gallery,
                participants_count=p_count,
                is_for_children=bool(raw.get("is_for_children", False)),
                age_rating_min=int(raw.get("age_rating_min", 0 if raw.get("is_for_children") else 12)),
            )
            ev.categories.append(cats[cat_id])
            session.add(ev)

        await session.execute(text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))"))
        await session.execute(text("SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT COALESCE(MAX(id), 1) FROM events))"))

        await session.commit()
        print(f"Seed OK: dev@point.local, {len(CATEGORY_SEEDS)} categories, {len(EVENT_SEEDS)} events.")
