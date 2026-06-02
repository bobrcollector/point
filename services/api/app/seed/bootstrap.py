from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select, text

from app.core.media import upload_file_exists
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models import Category, Event, User
from app.seed.data import CATEGORY_SEEDS, EVENT_SEEDS

DEV_EMAIL = "dev@point-demo.ru"
LEGACY_DEV_EMAIL = "dev@point.local"
DEV_PASSWORD = "dev12345"


def _picsum_cover(eid: int) -> str:
    return f"https://picsum.photos/seed/point{eid}/1200/800"


def _picsum_gallery(eid: int) -> list[str]:
    return [
        f"https://picsum.photos/seed/point{eid}a/1200/800",
        f"https://picsum.photos/seed/point{eid}b/1200/800",
        f"https://picsum.photos/seed/point{eid}c/1200/800",
    ]


def _cover_url(eid: int, raw: dict[str, object]) -> str:
    cover = raw.get("cover_image_url")
    if cover:
        return str(cover)
    return _picsum_cover(eid)


def _detail_fields(eid: int, title: str, venue: str) -> tuple[str, str, str, list[str], int]:
    description = (
        f"«{title}» — живое офлайн-мероприятие на площадке «{venue}». "
        "На странице собраны дата и время, точка на карте и контакты организатора. "
        "Вы можете отметить участие, написать в чат другим гостям и оставить отзыв после события."
    )
    address_detail = f"{venue}, Москва — вход по электронному билету или списку участников."
    organizer_name = "Point Community" if eid % 2 == 0 else "Городские инициативы"
    gallery_urls = _picsum_gallery(eid)
    participants_count = 18 + (eid % 55)
    return description, address_detail, organizer_name, gallery_urls, participants_count


def _event_from_seed(raw: dict[str, object], dev_user_id: int, cats: dict[int, Category]) -> Event:
    eid = int(raw["id"])
    title = str(raw["title"])
    venue = str(raw["location"])
    desc, addr, org_name, gallery, p_count = _detail_fields(eid, title, venue)
    cat_id = int(raw["category_id"])
    ev = Event(
        id=eid,
        organizer_id=dev_user_id,
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
        status="approved",
        requires_registration=True,
    )
    ev.categories.append(cats[cat_id])
    return ev


async def _sync_demo_events(session) -> tuple[int, int]:
    """Insert missing seed events and refresh datetimes on existing ones."""
    dev_user = await session.scalar(select(User).where(User.email == DEV_EMAIL))
    if dev_user is None:
        return 0, 0

    category_count = await session.scalar(select(func.count()).select_from(Category)) or 0
    if category_count == 0:
        for row in CATEGORY_SEEDS:
            session.add(Category(id=int(row["id"]), name=str(row["name"])))
        await session.flush()

    cats = {c.id: c for c in (await session.execute(select(Category))).scalars().all()}
    inserted = 0
    updated = 0

    for raw in EVENT_SEEDS:
        eid = int(raw["id"])
        existing = await session.scalar(select(Event).where(Event.id == eid))
        new_dt = datetime.fromisoformat(str(raw["event_datetime"]))
        if existing is not None:
            if existing.event_datetime != new_dt:
                existing.event_datetime = new_dt
                updated += 1
            continue
        session.add(_event_from_seed(raw, int(dev_user.id), cats))
        inserted += 1

    if inserted:
        await session.execute(
            text("SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT COALESCE(MAX(id), 1) FROM events))")
        )

    return inserted, updated


async def _backfill_covers(session) -> int:
    events = (await session.execute(select(Event))).scalars().all()
    updated = 0
    for ev in events:
        cover = ev.cover_image_url
        needs_cover = cover is None or (
            (str(cover).startswith("/api/v1/media/") or str(cover).startswith("/uploads/"))
            and not upload_file_exists(str(cover))
        )
        if needs_cover:
            ev.cover_image_url = _picsum_cover(ev.id)
            updated += 1
        g = ev.gallery_urls if isinstance(ev.gallery_urls, list) else []
        if not g or (
            g
            and all(
                str(u).startswith("/")
                and (str(u).startswith("/api/v1/media/") or str(u).startswith("/uploads/"))
                and not upload_file_exists(str(u))
                for u in g
            )
        ):
            ev.gallery_urls = _picsum_gallery(ev.id)
            updated += 1
    return updated


async def _ensure_dev_admin(session) -> None:
    changed = False
    dev = await session.scalar(select(User).where(User.email == DEV_EMAIL))
    legacy_dev = await session.scalar(select(User).where(User.email == LEGACY_DEV_EMAIL))
    if dev is None and legacy_dev is not None:
        legacy_dev.email = DEV_EMAIL
        dev = legacy_dev
        changed = True
    if dev is None:
        dev = User(
            email=DEV_EMAIL,
            display_name="Point Dev",
            password_hash=hash_password(DEV_PASSWORD),
            role="admin",
            email_verified=True,
        )
        session.add(dev)
        await session.commit()
        print(f"Seed: {DEV_EMAIL} created (admin, password {DEV_PASSWORD}).")
        return
    if not dev.password_hash:
        dev.password_hash = hash_password(DEV_PASSWORD)
        changed = True
    if dev.role != "admin":
        dev.role = "admin"
        changed = True
    if not dev.email_verified:
        dev.email_verified = True
        changed = True
    if changed:
        await session.commit()
        print(f"Seed: {DEV_EMAIL} updated (admin, password {DEV_PASSWORD}).")


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(Event.id).where(Event.id == 101))
        if existing is not None:
            updated_covers = await _backfill_covers(session)
            inserted, updated_dates = await _sync_demo_events(session)
            await _ensure_dev_admin(session)
            await session.commit()
            parts: list[str] = []
            if updated_covers:
                parts.append(f"restored missing event images for {updated_covers} row(s)")
            if inserted:
                parts.append(f"added {inserted} new event(s)")
            if updated_dates:
                parts.append(f"updated dates for {updated_dates} event(s)")
            if parts:
                print(f"Seed: {', '.join(parts)}.")
            else:
                print("Seed: demo data present, image URLs OK.")
            return

        dev_user = await session.scalar(select(User).where(User.email == DEV_EMAIL))
        if dev_user is None:
            dev_user = User(
                email=DEV_EMAIL,
                display_name="Point Dev",
                password_hash=hash_password(DEV_PASSWORD),
                role="admin",
                email_verified=True,
            )
            session.add(dev_user)
            await session.flush()

        category_count = await session.scalar(select(func.count()).select_from(Category)) or 0
        if category_count == 0:
            for row in CATEGORY_SEEDS:
                session.add(Category(id=int(row["id"]), name=str(row["name"])))
            await session.flush()

        cats = {c.id: c for c in (await session.execute(select(Category))).scalars().all()}

        for raw in EVENT_SEEDS:
            session.add(_event_from_seed(raw, int(dev_user.id), cats))

        await session.execute(text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))"))
        await session.execute(text("SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT COALESCE(MAX(id), 1) FROM events))"))

        await session.commit()
        print(f"Seed OK: {DEV_EMAIL}, {len(CATEGORY_SEEDS)} categories, {len(EVENT_SEEDS)} events.")
