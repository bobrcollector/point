from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.catalog import service as catalog_service
from app.api.v1.catalog.schemas import CategoriesResponse, EventDetail, EventsResponse
from app.db.session import get_db

router = APIRouter()


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


@router.get("/events/{event_id}", response_model=EventDetail)
async def get_event_detail(event_id: int, session: AsyncSession = Depends(get_db)):
    ev = await catalog_service.get_event_by_id(session, event_id)
    if ev is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return EventDetail.model_validate(catalog_service.event_to_detail_dict(ev))


@router.get("/categories", response_model=CategoriesResponse)
async def get_categories(session: AsyncSession = Depends(get_db)):
    items = await catalog_service.list_categories_payload(session)
    return {"items": items}
