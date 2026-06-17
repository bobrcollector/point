from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text

from app.core.media import upload_file_exists
from app.core.placeholders import (
    is_unreliable_remote_media,
    placeholder_cover_path,
    placeholder_gallery_paths,
)
from app.core.security import hash_password
from app.db.session import AsyncSessionLocal
from app.models import Category, Complaint, Event, EventParticipation, EventReview, User
from app.seed.data import (
    CATEGORY_SEEDS,
    CHART_COMPLAINTS_PER_DAY,
    CHART_EVENT_ID_MAX,
    CHART_EVENT_ID_MIN,
    CHART_USERS_PER_DAY,
    DEMO_USER_EMAIL_DOMAIN,
    EVENT_SEEDS,
)

DEV_EMAIL = "dev@point-demo.ru"
LEGACY_DEV_EMAIL = "dev@point.local"
DEV_PASSWORD = "dev12345"


def _demo_cover(eid: int) -> str:
    return placeholder_cover_path(eid)


def _demo_gallery(eid: int) -> list[str]:
    return placeholder_gallery_paths(eid)


def _cover_url(eid: int, raw: dict[str, object]) -> str:
    cover = raw.get("cover_image_url")
    if cover:
        return str(cover)
    return _demo_cover(eid)


def _chart_created_at(*, days_ago: int, slot: int) -> datetime:
    now = datetime.now(timezone.utc)
    day = (now - timedelta(days=days_ago)).date()
    hour = 9 + (slot % 10)
    minute = (slot * 13) % 60
    return datetime.combine(day, datetime.min.time().replace(hour=hour, minute=minute), tzinfo=timezone.utc)


def _event_chart_created_at(eid: int) -> datetime:
    days_ago = (eid - CHART_EVENT_ID_MIN) % 7
    return _chart_created_at(days_ago=days_ago, slot=eid)


def _detail_fields(eid: int, title: str, venue: str, city: str = "Москва") -> tuple[str, str, str, list[str], int]:
    description = (
        f"«{title}» — живое офлайн-мероприятие на площадке «{venue}». "
        "На странице собраны дата и время, точка на карте и контакты организатора. "
        "Вы можете отметить участие, написать в чат другим гостям и оставить отзыв после события."
    )
    address_detail = f"{venue}, {city} — вход по электронному билету или списку участников."
    organizer_name = "Point Community" if eid % 2 == 0 else "Городские инициативы"
    gallery_urls = _demo_gallery(eid)
    participants_count = 18 + (eid % 55)
    return description, address_detail, organizer_name, gallery_urls, participants_count


def _event_from_seed(raw: dict[str, object], dev_user_id: int, cats: dict[int, Category]) -> Event:
    eid = int(raw["id"])
    title = str(raw["title"])
    venue = str(raw["location"])
    city = str(raw.get("city", "Москва"))
    desc, addr, org_name, gallery, p_count = _detail_fields(eid, title, venue, city)
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
        created_at=_event_chart_created_at(eid),
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


async def _sync_admin_chart_data(session) -> tuple[int, int]:
    """Demo users and created_at spread for admin dashboard charts."""
    users_created = 0
    rows_updated = 0
    slot = 0

    for i, count in enumerate(CHART_USERS_PER_DAY):
        days_ago = 6 - i
        for n in range(count):
            email = f"chart-user-d{days_ago}-n{n}@{DEMO_USER_EMAIL_DOMAIN}"
            user = await session.scalar(select(User).where(User.email == email))
            created_at = _chart_created_at(days_ago=days_ago, slot=slot)
            slot += 1
            if user is None:
                session.add(
                    User(
                        email=email,
                        display_name=f"Demo {days_ago}d #{n + 1}",
                        password_hash=hash_password(DEV_PASSWORD),
                        role="user",
                        email_verified=True,
                        created_at=created_at,
                    )
                )
                users_created += 1
            elif user.created_at.date() != created_at.date():
                user.created_at = created_at
                rows_updated += 1

    seed_events = (
        await session.execute(
            select(Event).where(Event.id >= CHART_EVENT_ID_MIN, Event.id <= CHART_EVENT_ID_MAX)
        )
    ).scalars().all()
    for ev in seed_events:
        target = _event_chart_created_at(ev.id)
        if ev.created_at.date() != target.date():
            ev.created_at = target
            rows_updated += 1

    return users_created, rows_updated


PENDING_EVENT_SEEDS: list[dict[str, object]] = [
    {
        "id": 143,
        "title": "Open mic: поэзия и музыка",
        "event_datetime": "2026-06-18T20:00:00+03:00",
        "location": "Клуб «Аrt»",
        "price": 0,
        "category_id": 1,
    },
    {
        "id": 144,
        "title": "Мастер-класс по каллиграфии",
        "event_datetime": "2026-06-20T14:00:00+03:00",
        "location": "Студия «Чернила»",
        "price": 1500,
        "category_id": 9,
    },
]

DEMO_COMPLAINT_REASONS = [
    "Некорректное описание события",
    "Подозрительная ссылка в описании",
    "Дублирует другое мероприятие",
    "Неверное место проведения",
    "Спам в названии",
    "Мероприятие уже отменено",
    "Нарушение правил площадки",
]

DEMO_REVIEW_TEXTS = [
    "Отличная атмосфера, обязательно приду ещё!",
    "Организация на высоте, всё началось вовремя.",
    "Интересная программа, но было тесновато.",
    "Понравилось, рекомендую друзьям.",
    "Хороший спикер и полезный материал.",
    "Немного затянулось, но в целом классно.",
    "Супер локация и дружелюбная публика.",
    "Вернусь на следующий сезон.",
]


async def _sync_admin_activity_data(session) -> tuple[int, int]:
    """Participations, reviews, complaints and pending events for admin metrics."""
    dev_user = await session.scalar(select(User).where(User.email == DEV_EMAIL))
    if dev_user is None:
        return 0, 0

    demo_users = (
        await session.execute(
            select(User)
            .where(User.email.like(f"chart-user-%@{DEMO_USER_EMAIL_DOMAIN}"))
            .order_by(User.id)
        )
    ).scalars().all()
    if not demo_users:
        return 0, 0

    cats = {c.id: c for c in (await session.execute(select(Category))).scalars().all()}
    created = 0
    updated = 0

    for raw in PENDING_EVENT_SEEDS:
        eid = int(raw["id"])
        existing = await session.scalar(select(Event).where(Event.id == eid))
        if existing is not None:
            if existing.status != "pending":
                existing.status = "pending"
                updated += 1
            continue
        title = str(raw["title"])
        venue = str(raw["location"])
        desc, addr, org_name, gallery, p_count = _detail_fields(eid, title, venue)
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
            cover_image_url=_demo_cover(eid),
            latitude=55.75,
            longitude=37.62,
            gallery_urls=gallery,
            participants_count=p_count,
            status="pending",
            requires_registration=True,
            created_at=_event_chart_created_at(eid),
        )
        ev.categories.append(cats[int(raw["category_id"])])
        session.add(ev)
        created += 1

    participation_pairs = [
        (demo_users[i % len(demo_users)].id, 101 + (i % 20))
        for i in range(18)
    ]
    for user_id, event_id in participation_pairs:
        exists = await session.scalar(
            select(EventParticipation.user_id).where(
                EventParticipation.user_id == user_id,
                EventParticipation.event_id == event_id,
            )
        )
        if exists is not None:
            continue
        session.add(
            EventParticipation(
                user_id=user_id,
                event_id=event_id,
                created_at=_chart_created_at(days_ago=(event_id - 101) % 7, slot=event_id),
            )
        )
        created += 1

    for i, user in enumerate(demo_users[: len(DEMO_REVIEW_TEXTS)]):
        event_id = 101 + i
        exists = await session.scalar(
            select(EventReview.id).where(EventReview.user_id == user.id, EventReview.event_id == event_id)
        )
        if exists is not None:
            continue
        session.add(
            EventReview(
                event_id=event_id,
                user_id=user.id,
                author=user.display_name,
                text=DEMO_REVIEW_TEXTS[i],
                rating=4 + (i % 2),
                created_at=_chart_created_at(days_ago=i % 7, slot=200 + i),
            )
        )
        created += 1

    complaint_idx = 0
    for i, count in enumerate(CHART_COMPLAINTS_PER_DAY):
        days_ago = 6 - i
        for n in range(count):
            user = demo_users[complaint_idx % len(demo_users)]
            event_id = 105 + (complaint_idx % 15)
            complaint_idx += 1
            marker = f"demo-complaint-d{days_ago}-n{n}"
            existing = await session.scalar(
                select(Complaint.id).where(Complaint.reason.like(f"{marker}|%"))
            )
            created_at = _chart_created_at(days_ago=days_ago, slot=300 + complaint_idx)
            status = "pending" if complaint_idx <= 6 else "resolved"
            reason = f"{marker}|{DEMO_COMPLAINT_REASONS[complaint_idx % len(DEMO_COMPLAINT_REASONS)]}"
            if existing is not None:
                complaint = await session.get(Complaint, existing)
                if complaint and complaint.created_at.date() != created_at.date():
                    complaint.created_at = created_at
                    complaint.status = status
                    updated += 1
                continue
            session.add(
                Complaint(
                    user_id=user.id,
                    event_id=event_id,
                    reason=reason,
                    status=status,
                    created_at=created_at,
                )
            )
            created += 1

    banned = demo_users[0]
    if not banned.is_banned:
        banned.is_banned = True
        updated += 1

    if created:
        await session.execute(
            text("SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT COALESCE(MAX(id), 1) FROM events))")
        )

    return created, updated


def _needs_cover_refresh(url: str | None) -> bool:
    if is_unreliable_remote_media(url):
        return True
    if not url:
        return True
    value = str(url).strip()
    if "/api/v1/placeholders/" in value:
        return False
    if value.startswith("/api/v1/media/") or value.startswith("/uploads/"):
        return not upload_file_exists(value)
    return False


def _gallery_url_ok(url: str) -> bool:
    if "/api/v1/placeholders/" in url:
        return True
    if url.startswith("/api/v1/media/") or url.startswith("/uploads/"):
        return upload_file_exists(url)
    return not is_unreliable_remote_media(url)


def _needs_gallery_refresh(urls: list[object] | None) -> bool:
    gallery = [str(u) for u in urls] if isinstance(urls, list) else []
    if len(gallery) < 3:
        return True
    return not all(_gallery_url_ok(u) for u in gallery)


async def _backfill_covers(session) -> int:
    return await repair_event_media_urls(session)


async def repair_event_media_urls(session) -> int:
    events = (await session.execute(select(Event))).scalars().all()
    updated = 0
    for ev in events:
        if _needs_cover_refresh(ev.cover_image_url):
            ev.cover_image_url = _demo_cover(ev.id)
            updated += 1
        if _needs_gallery_refresh(ev.gallery_urls if isinstance(ev.gallery_urls, list) else None):
            ev.gallery_urls = _demo_gallery(ev.id)
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
            created_at=_chart_created_at(days_ago=4, slot=0),
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
            chart_users, chart_rows = await _sync_admin_chart_data(session)
            await session.flush()
            activity_created, activity_updated = await _sync_admin_activity_data(session)
            await _ensure_dev_admin(session)
            await session.commit()
            parts: list[str] = []
            if updated_covers:
                parts.append(f"restored missing event images for {updated_covers} row(s)")
            if inserted:
                parts.append(f"added {inserted} new event(s)")
            if updated_dates:
                parts.append(f"updated dates for {updated_dates} event(s)")
            if chart_users or chart_rows:
                parts.append(f"chart demo data: {chart_users} user(s), {chart_rows} row(s) updated")
            if activity_created or activity_updated:
                parts.append(f"activity demo data: {activity_created} added, {activity_updated} updated")
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
                created_at=_chart_created_at(days_ago=4, slot=0),
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

        chart_users, _ = await _sync_admin_chart_data(session)
        await session.flush()
        activity_created, _ = await _sync_admin_activity_data(session)

        await session.execute(text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))"))
        await session.execute(text("SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT COALESCE(MAX(id), 1) FROM events))"))

        await session.commit()
        print(
            f"Seed OK: {DEV_EMAIL}, {len(CATEGORY_SEEDS)} categories, "
            f"{len(EVENT_SEEDS)} events, {chart_users} chart demo users, "
            f"{activity_created} activity records."
        )
