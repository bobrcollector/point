from __future__ import annotations

import os
from dataclasses import dataclass
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
from app.models import (
    Category,
    Complaint,
    Event,
    EventFavorite,
    EventParticipation,
    EventReview,
    EventTicketType,
    EventView,
    Notification,
    User,
)
from app.seed.data import (
    CATEGORY_SEEDS,
    CHART_COMPLAINTS_PER_DAY,
    CHART_EVENT_ID_MAX,
    CHART_EVENT_ID_MIN,
    CHART_PARTICIPATIONS_PER_DAY,
    CHART_REVIEWS_PER_DAY,
    CHART_USERS_PER_DAY,
    CHART_VIEWS_PER_DAY,
    DASHBOARD_CHART_DAYS,
    DEMO_DISPLAY_NAMES,
    DEMO_USER_EMAIL_DOMAIN,
    EVENT_SEEDS,
    LOW_RATED_EVENT_IDS,
    ORGANIZER_SEEDS,
    POPULAR_EVENT_IDS,
)

DEV_EMAIL = "dev@point-demo.ru"
LEGACY_DEV_EMAIL = "dev@point.local"
DEV_PASSWORD = "dev12345"


@dataclass(frozen=True)
class SeedOptions:
    """safe=True: только добавляет недостающие демо-записи, не меняет существующие."""

    safe: bool = False


def parse_seed_options(argv: list[str] | None = None) -> SeedOptions:
    safe = os.getenv("POINT_SEED_SAFE", "").strip().lower() in ("1", "true", "yes", "on")
    if argv and "--safe" in argv:
        safe = True
    return SeedOptions(safe=safe)


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


def _chart_days_ago(day_index: int, *, total: int = DASHBOARD_CHART_DAYS) -> int:
    return (total - 1) - day_index


def _event_chart_created_at(eid: int) -> datetime:
    days_ago = (eid - CHART_EVENT_ID_MIN) % DASHBOARD_CHART_DAYS
    return _chart_created_at(days_ago=days_ago, slot=eid)


def _detail_fields(
    eid: int,
    title: str,
    venue: str,
    city: str = "Москва",
    organizer_name: str | None = None,
) -> tuple[str, str, str, list[str]]:
    description = (
        f"«{title}» — живое офлайн-мероприятие на площадке «{venue}». "
        "На странице собраны дата и время, точка на карте и контакты организатора. "
        "Вы можете отметить участие, написать в чат другим гостям и оставить отзыв после события."
    )
    address_detail = f"{venue}, {city} — вход по электронному билету или списку участников."
    org = organizer_name or ORGANIZER_SEEDS[eid % len(ORGANIZER_SEEDS)]["org_name"]
    gallery_urls = _demo_gallery(eid)
    return description, address_detail, org, gallery_urls


def _organizer_for_event(eid: int) -> dict[str, str]:
    return ORGANIZER_SEEDS[eid % len(ORGANIZER_SEEDS)]


def _event_from_seed(raw: dict[str, object], organizer_id: int, cats: dict[int, Category]) -> Event:
    eid = int(raw["id"])
    title = str(raw["title"])
    venue = str(raw["location"])
    city = str(raw.get("city", "Москва"))
    org = _organizer_for_event(eid)
    desc, addr, org_name, gallery = _detail_fields(eid, title, venue, city, org["org_name"])
    cat_id = int(raw["category_id"])
    ev = Event(
        id=eid,
        organizer_id=organizer_id,
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
        participants_count=0,
        is_for_children=bool(raw.get("is_for_children", False)),
        age_rating_min=int(raw.get("age_rating_min", 0 if raw.get("is_for_children") else 12)),
        status="approved",
        requires_registration=True,
        created_at=_event_chart_created_at(eid),
    )
    ev.categories.append(cats[cat_id])
    return ev


async def _ensure_organizers(session, opts: SeedOptions) -> dict[str, User]:
    organizers: dict[str, User] = {}
    for row in ORGANIZER_SEEDS:
        email = row["email"]
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                display_name=row["display_name"],
                password_hash=hash_password(DEV_PASSWORD),
                role="user",
                email_verified=True,
                created_at=_chart_created_at(days_ago=60 + ORGANIZER_SEEDS.index(row), slot=10),
            )
            session.add(user)
        elif not opts.safe:
            user.display_name = row["display_name"]
            if not user.email_verified:
                user.email_verified = True
        organizers[email] = user
    await session.flush()
    return organizers


async def _sync_demo_events(session, opts: SeedOptions) -> tuple[int, int]:
    """Insert missing seed events; refresh datetimes on existing ones unless safe mode."""
    organizers = await _ensure_organizers(session, opts)
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
        org = _organizer_for_event(eid)
        organizer = organizers.get(org["email"]) or dev_user
        existing = await session.scalar(select(Event).where(Event.id == eid))
        new_dt = datetime.fromisoformat(str(raw["event_datetime"]))
        if existing is not None:
            if opts.safe:
                continue
            if existing.event_datetime != new_dt:
                existing.event_datetime = new_dt
                updated += 1
            if int(existing.organizer_id) != int(organizer.id):
                existing.organizer_id = int(organizer.id)
                existing.organizer_name = org["org_name"]
                updated += 1
            continue
        session.add(_event_from_seed(raw, int(organizer.id), cats))
        inserted += 1

    if inserted:
        await session.execute(
            text("SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT COALESCE(MAX(id), 1) FROM events))")
        )

    return inserted, updated


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

DEMO_REVIEW_TEXTS = [
    "Отличная атмосфера, обязательно приду ещё!",
    "Организация на высоте, всё началось вовремя.",
    "Интересная программа, но было тесновато.",
    "Понравилось, рекомендую друзьям.",
    "Хороший спикер и полезный материал.",
    "Немного затянулось, но в целом классно.",
    "Супер локация и дружелюбная публика.",
    "Вернусь на следующий сезон.",
    "Ожидания оправдались полностью.",
    "Хорошо для первого раза, есть куда расти.",
    "Слишком шумно и неудобная рассадка.",
    "Организация подвела — начали с задержкой на 40 минут.",
    "Не соответствует описанию на сайте.",
    "Скучная программа, ушёл раньше.",
]

DEMO_COMPLAINT_TYPES = [
    "misleading: Некорректное описание события",
    "spam: Подозрительная реклама в описании",
    "misleading: Дублирует другое мероприятие",
    "misleading: Неверное место проведения",
    "spam: Спам в названии",
    "misleading: Мероприятие уже отменено",
    "unsafe: Нарушение правил площадки",
]


async def _sync_event_schedule(session, opts: SeedOptions) -> int:
    """Keep demo events split between past (with reviews) and upcoming (for catalog)."""
    if opts.safe:
        return 0
    now = datetime.now(timezone.utc)
    updated = 0
    events = (
        await session.execute(
            select(Event).where(
                Event.id >= CHART_EVENT_ID_MIN,
                Event.id <= CHART_EVENT_ID_MAX,
                Event.status == "approved",
            ).order_by(Event.id)
        )
    ).scalars().all()
    total = len(events)
    past_cutoff = max(1, total * 65 // 100)
    for idx, ev in enumerate(events):
        rel = ev.id - CHART_EVENT_ID_MIN
        if idx < past_cutoff:
            days_ago = 2 + (rel % 18)
            hour = 10 + (rel % 10)
            target = datetime.combine(
                (now - timedelta(days=days_ago)).date(),
                datetime.min.time().replace(hour=hour, minute=(rel * 11) % 60),
                tzinfo=timezone.utc,
            )
        elif idx == past_cutoff:
            target = datetime.combine(
                now.date(),
                datetime.min.time().replace(hour=15, minute=30),
                tzinfo=timezone.utc,
            )
        else:
            days_ahead = 1 + ((idx - past_cutoff) % 14)
            hour = 12 + (rel % 9)
            target = datetime.combine(
                (now + timedelta(days=days_ahead)).date(),
                datetime.min.time().replace(hour=hour, minute=(rel * 7) % 60),
                tzinfo=timezone.utc,
            )
        if ev.event_datetime != target:
            ev.event_datetime = target
            updated += 1

    for raw in PENDING_EVENT_SEEDS:
        existing = await session.scalar(select(Event).where(Event.id == int(raw["id"])))
        if existing is None:
            continue
        target = now + timedelta(days=4 + int(raw["id"]) % 10, hours=18)
        if existing.event_datetime != target:
            existing.event_datetime = target
            updated += 1

    return updated


async def _sync_admin_chart_data(session, opts: SeedOptions) -> tuple[int, int]:
    """Demo users and created_at spread for admin dashboard charts."""
    users_created = 0
    rows_updated = 0
    slot = 0

    for i, count in enumerate(CHART_USERS_PER_DAY):
        days_ago = _chart_days_ago(i, total=len(CHART_USERS_PER_DAY))
        for n in range(count):
            email = f"chart-user-d{days_ago}-n{n}@{DEMO_USER_EMAIL_DOMAIN}"
            user = await session.scalar(select(User).where(User.email == email))
            created_at = _chart_created_at(days_ago=days_ago, slot=slot)
            slot += 1
            if user is None:
                session.add(
                    User(
                        email=email,
                        display_name=DEMO_DISPLAY_NAMES[slot % len(DEMO_DISPLAY_NAMES)],
                        password_hash=hash_password(DEV_PASSWORD),
                        role="user",
                        email_verified=True,
                        created_at=created_at,
                    )
                )
                users_created += 1
            else:
                if opts.safe:
                    continue
                user.display_name = DEMO_DISPLAY_NAMES[slot % len(DEMO_DISPLAY_NAMES)]
                if user.created_at.date() != created_at.date():
                    user.created_at = created_at
                    rows_updated += 1

    if not opts.safe:
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


async def _sync_event_engagement(session, demo_users: list[User], opts: SeedOptions) -> int:
    """Синхронизировать счётчики, избранное, билеты и уведомления."""
    updated = 0
    dev_user = await session.scalar(select(User).where(User.email == DEV_EMAIL))

    events = (
        await session.execute(select(Event).where(Event.id >= CHART_EVENT_ID_MIN, Event.id <= CHART_EVENT_ID_MAX))
    ).scalars().all()
    for ev in events:
        parts_count = await session.scalar(
            select(func.count()).select_from(EventParticipation).where(EventParticipation.event_id == ev.id)
        )
        target_parts = int(parts_count or 0)
        if int(ev.participants_count or 0) != target_parts:
            ev.participants_count = target_parts
            updated += 1

        avg_rating = await session.scalar(
            select(func.avg(EventReview.rating)).where(EventReview.event_id == ev.id)
        )
        if avg_rating is not None:
            new_rating = round(float(avg_rating), 1)
            if not opts.safe and (
                ev.average_rating is None or abs(float(ev.average_rating) - new_rating) > 0.05
            ):
                ev.average_rating = new_rating
                updated += 1
        elif not opts.safe and ev.id in LOW_RATED_EVENT_IDS and (
            ev.average_rating is None or float(ev.average_rating) >= 3
        ):
            ev.average_rating = round(2.2 + (ev.id % 4) * 0.15, 1)
            updated += 1

    for idx, user in enumerate(demo_users[: min(80, len(demo_users))]):
        event_id = POPULAR_EVENT_IDS[idx % len(POPULAR_EVENT_IDS)]
        existing = await session.scalar(
            select(EventFavorite.user_id).where(
                EventFavorite.user_id == user.id,
                EventFavorite.event_id == event_id,
            )
        )
        if existing is None:
            session.add(EventFavorite(user_id=int(user.id), event_id=event_id))
            updated += 1

    paid_events = (
        await session.execute(select(Event).where(Event.price > 0, Event.id >= CHART_EVENT_ID_MIN))
    ).scalars().all()
    for ev in paid_events:
        existing_types = await session.scalar(
            select(func.count()).select_from(EventTicketType).where(EventTicketType.event_id == ev.id)
        )
        if existing_types:
            continue
        base_price = float(ev.price)
        session.add(
            EventTicketType(event_id=ev.id, name="Стандарт", price=base_price, quantity=120, sort_order=0)
        )
        session.add(
            EventTicketType(
                event_id=ev.id,
                name="VIP",
                price=round(base_price * 1.7, 2),
                quantity=24,
                sort_order=1,
            )
        )
        updated += 2

    if dev_user:
        existing_notif = await session.scalar(
            select(func.count()).select_from(Notification).where(Notification.user_id == dev_user.id)
        )
        if not existing_notif:
            session.add(
                Notification(
                    user_id=int(dev_user.id),
                    type="moderation",
                    content="2 события ожидают модерации",
                    is_read=False,
                )
            )
            session.add(
                Notification(
                    user_id=int(dev_user.id),
                    type="complaint",
                    content="8 новых жалоб требуют проверки",
                    is_read=False,
                )
            )
            updated += 2

    return updated


async def _sync_admin_activity_data(session, opts: SeedOptions) -> tuple[int, int]:
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
            if not opts.safe and existing.status != "pending":
                existing.status = "pending"
                updated += 1
            continue
        title = str(raw["title"])
        venue = str(raw["location"])
        org = _organizer_for_event(eid)
        desc, addr, org_name, gallery = _detail_fields(eid, title, venue, org_name=org["org_name"])
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
            participants_count=0,
            status="pending",
            requires_registration=True,
            created_at=_event_chart_created_at(eid),
        )
        ev.categories.append(cats[int(raw["category_id"])])
        session.add(ev)
        created += 1

    participation_pairs: list[tuple[int, int, int, int]] = []
    participation_idx = 0
    seen_pairs: set[tuple[int, int]] = set()
    existing_pairs = (
        await session.execute(select(EventParticipation.user_id, EventParticipation.event_id))
    ).all()
    seen_pairs.update((int(row[0]), int(row[1])) for row in existing_pairs)
    all_event_ids = list(range(CHART_EVENT_ID_MIN, CHART_EVENT_ID_MAX + 1))
    max_attempts = len(demo_users) * len(all_event_ids)
    for i, count in enumerate(CHART_PARTICIPATIONS_PER_DAY):
        days_ago = _chart_days_ago(i, total=len(CHART_PARTICIPATIONS_PER_DAY))
        created_today = 0
        attempt = 0
        while created_today < count and attempt < max_attempts:
            user = demo_users[(participation_idx * 5 + attempt) % len(demo_users)]
            if (participation_idx + attempt) % 4 == 0:
                event_id = POPULAR_EVENT_IDS[(participation_idx + attempt) % len(POPULAR_EVENT_IDS)]
            else:
                event_id = all_event_ids[(participation_idx * 7 + attempt * 3) % len(all_event_ids)]
            attempt += 1
            pair = (int(user.id), event_id)
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            participation_pairs.append((pair[0], pair[1], days_ago, participation_idx))
            participation_idx += 1
            created_today += 1

    for user_id, event_id, days_ago, slot in participation_pairs:
        existing = await session.scalar(
            select(EventParticipation.user_id).where(
                EventParticipation.user_id == user_id,
                EventParticipation.event_id == event_id,
            )
        )
        created_at = _chart_created_at(days_ago=days_ago, slot=400 + slot)
        if existing is not None:
            if not opts.safe:
                row = await session.scalar(
                    select(EventParticipation).where(
                        EventParticipation.user_id == user_id,
                        EventParticipation.event_id == event_id,
                    )
                )
                if row and row.created_at.date() != created_at.date():
                    row.created_at = created_at
                    updated += 1
            continue
        session.add(
            EventParticipation(
                user_id=user_id,
                event_id=event_id,
                created_at=created_at,
            )
        )
        created += 1

    review_idx = 0
    for i, count in enumerate(CHART_REVIEWS_PER_DAY):
        days_ago = _chart_days_ago(i, total=len(CHART_REVIEWS_PER_DAY))
        for _n in range(count):
            if review_idx >= len(participation_pairs):
                break
            user_id, event_id, _part_days_ago, slot = participation_pairs[review_idx]
            user = next(u for u in demo_users if int(u.id) == user_id)
            exists = await session.scalar(
                select(EventReview.id).where(EventReview.user_id == user_id, EventReview.event_id == event_id)
            )
            created_at = _chart_created_at(days_ago=days_ago, slot=500 + review_idx)
            if event_id in LOW_RATED_EVENT_IDS:
                rating = 1 + (review_idx % 2)
            else:
                rating = 3 + (review_idx % 3)
            review_text = DEMO_REVIEW_TEXTS[review_idx % len(DEMO_REVIEW_TEXTS)]
            if exists is not None:
                if not opts.safe:
                    row = await session.get(EventReview, exists)
                    if row and row.created_at.date() != created_at.date():
                        row.created_at = created_at
                        row.rating = rating
                        updated += 1
                review_idx += 1
                continue
            session.add(
                EventReview(
                    event_id=event_id,
                    user_id=user_id,
                    author=user.display_name,
                    text=review_text,
                    rating=rating,
                    created_at=created_at,
                )
            )
            created += 1
            review_idx += 1

    complaint_idx = 0
    for i, count in enumerate(CHART_COMPLAINTS_PER_DAY):
        days_ago = _chart_days_ago(i, total=len(CHART_COMPLAINTS_PER_DAY))
        for n in range(count):
            user = demo_users[complaint_idx % len(demo_users)]
            event_id = all_event_ids[complaint_idx % len(all_event_ids)]
            complaint_idx += 1
            marker = f"seed-complaint-d{days_ago}-n{n}"
            existing = await session.scalar(
                select(Complaint.id).where(Complaint.reason.like(f"{marker}|%"))
            )
            created_at = _chart_created_at(days_ago=days_ago, slot=300 + complaint_idx)
            status = "pending" if complaint_idx <= 8 else "resolved"
            reason = f"{marker}|{DEMO_COMPLAINT_TYPES[complaint_idx % len(DEMO_COMPLAINT_TYPES)]}"
            if existing is not None:
                if not opts.safe:
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
    if not opts.safe and not banned.is_banned:
        banned.is_banned = True
        updated += 1

    view_idx = 0
    for i, count in enumerate(CHART_VIEWS_PER_DAY):
        days_ago = _chart_days_ago(i, total=len(CHART_VIEWS_PER_DAY))
        day_start = _chart_created_at(days_ago=days_ago, slot=0)
        day_end = day_start + timedelta(days=1)
        for n in range(count):
            if view_idx % 4 == 0:
                event_id = POPULAR_EVENT_IDS[view_idx % len(POPULAR_EVENT_IDS)]
            else:
                event_id = all_event_ids[view_idx % len(all_event_ids)]
            user = demo_users[view_idx % len(demo_users)]
            anonymous = view_idx % 5 == 0
            existing_count = await session.scalar(
                select(func.count())
                .select_from(EventView)
                .where(
                    EventView.event_id == event_id,
                    EventView.user_id == (None if anonymous else int(user.id)),
                    EventView.created_at >= day_start,
                    EventView.created_at < day_end,
                )
            )
            if not existing_count:
                session.add(
                    EventView(
                        event_id=event_id,
                        user_id=None if anonymous else int(user.id),
                        created_at=_chart_created_at(days_ago=days_ago, slot=600 + view_idx),
                    )
                )
                created += 1
            view_idx += 1

    updated += await _sync_event_engagement(session, demo_users, opts)

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


async def repair_event_media_urls(session, opts: SeedOptions | None = None) -> int:
    opts = opts or SeedOptions()
    events = (await session.execute(select(Event))).scalars().all()
    updated = 0
    for ev in events:
        if opts.safe:
            if not ev.cover_image_url:
                ev.cover_image_url = _demo_cover(ev.id)
                updated += 1
            gallery = ev.gallery_urls if isinstance(ev.gallery_urls, list) else None
            if not gallery:
                ev.gallery_urls = _demo_gallery(ev.id)
                updated += 1
            continue
        if _needs_cover_refresh(ev.cover_image_url):
            ev.cover_image_url = _demo_cover(ev.id)
            updated += 1
        if _needs_gallery_refresh(ev.gallery_urls if isinstance(ev.gallery_urls, list) else None):
            ev.gallery_urls = _demo_gallery(ev.id)
            updated += 1
    return updated


async def _backfill_covers(session, opts: SeedOptions) -> int:
    return await repair_event_media_urls(session, opts)


async def _ensure_dev_admin(session, opts: SeedOptions) -> None:
    changed = False
    dev = await session.scalar(select(User).where(User.email == DEV_EMAIL))
    legacy_dev = await session.scalar(select(User).where(User.email == LEGACY_DEV_EMAIL))
    if dev is None and legacy_dev is not None and not opts.safe:
        legacy_dev.email = DEV_EMAIL
        dev = legacy_dev
        changed = True
    if dev is None:
        dev = User(
            email=DEV_EMAIL,
            display_name="Администратор Point",
            password_hash=hash_password(DEV_PASSWORD),
            role="admin",
            email_verified=True,
            created_at=_chart_created_at(days_ago=4, slot=0),
        )
        session.add(dev)
        await session.commit()
        print(f"Seed: {DEV_EMAIL} created (admin, password {DEV_PASSWORD}).")
        return
    if opts.safe:
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
    if dev.display_name in ("Point Dev", "Point Community"):
        dev.display_name = "Администратор Point"
        changed = True
    if changed:
        await session.commit()
        print(f"Seed: {DEV_EMAIL} updated (admin, password {DEV_PASSWORD}).")


async def main(opts: SeedOptions | None = None) -> None:
    opts = opts or parse_seed_options()
    if opts.safe:
        print("Seed: safe mode — only missing demo rows will be added, existing data is left unchanged.")
    async with AsyncSessionLocal() as session:
        existing = await session.scalar(select(Event.id).where(Event.id == 101))
        if existing is not None:
            updated_covers = await _backfill_covers(session, opts)
            inserted, updated_dates = await _sync_demo_events(session, opts)
            schedule_updated = await _sync_event_schedule(session, opts)
            chart_users, chart_rows = await _sync_admin_chart_data(session, opts)
            await session.flush()
            activity_created, activity_updated = await _sync_admin_activity_data(session, opts)
            await _ensure_dev_admin(session, opts)
            await session.commit()
            parts: list[str] = []
            if updated_covers:
                parts.append(f"restored missing event images for {updated_covers} row(s)")
            if inserted:
                parts.append(f"added {inserted} new event(s)")
            if updated_dates:
                parts.append(f"updated dates for {updated_dates} event(s)")
            if schedule_updated:
                parts.append(f"refreshed schedule for {schedule_updated} event(s)")
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
                display_name="Администратор Point",
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
        organizers = await _ensure_organizers(session, opts)

        for raw in EVENT_SEEDS:
            eid = int(raw["id"])
            org = _organizer_for_event(eid)
            organizer = organizers.get(org["email"]) or dev_user
            session.add(_event_from_seed(raw, int(organizer.id), cats))

        schedule_updated = await _sync_event_schedule(session, opts)
        chart_users, _ = await _sync_admin_chart_data(session, opts)
        await session.flush()
        activity_created, _ = await _sync_admin_activity_data(session, opts)

        await session.execute(text("SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT COALESCE(MAX(id), 1) FROM users))"))
        await session.execute(text("SELECT setval(pg_get_serial_sequence('events', 'id'), (SELECT COALESCE(MAX(id), 1) FROM events))"))

        await session.commit()
        print(
            f"Seed OK: {DEV_EMAIL}, {len(CATEGORY_SEEDS)} categories, "
            f"{len(EVENT_SEEDS)} events, schedule {schedule_updated} updated, "
            f"{chart_users} chart demo users, "
            f"{activity_created} activity records."
        )
