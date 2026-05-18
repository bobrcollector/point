import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_organizer_id
from app.api.v1.organizer import service as organizer_service
from app.api.v1.organizer.schemas import (
    EventCreateIn,
    EventUpdateIn,
    OrganizerEventDetail,
    OrganizerEventsResponse,
    UploadResponse,
)
from app.db.session import get_db

router = APIRouter()

UPLOAD_DIR = Path(__file__).resolve().parents[4] / "uploads"
ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_BYTES = 8 * 1024 * 1024
MAX_EDGE = 1920


def _process_upload(data: bytes, ext: str) -> tuple[bytes, str]:
    """Сжатие и приведение к WebP/JPEG для хранения."""
    try:
        img = Image.open(io.BytesIO(data))
        img = img.convert("RGB")
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        if ext in {".png", ".webp", ".gif"}:
            img.save(out, format="WEBP", quality=85, method=6)
            return out.getvalue(), ".webp"
        img.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue(), ".jpg"
    except Exception:
        return data, ext


@router.get("/events", response_model=OrganizerEventsResponse)
async def list_my_events(
    session: AsyncSession = Depends(get_db),
    organizer_id: int = Depends(get_current_organizer_id),
):
    rows = await organizer_service.list_organizer_events(session, organizer_id)
    items = [organizer_service._event_to_list_item(ev) for ev in rows]
    return {"total": len(items), "items": items}


@router.post("/events", response_model=OrganizerEventDetail, status_code=201)
async def create_event(
    payload: EventCreateIn,
    session: AsyncSession = Depends(get_db),
    organizer_id: int = Depends(get_current_organizer_id),
):
    ev = await organizer_service.create_event(session, organizer_id, payload)
    await session.commit()
    return OrganizerEventDetail.model_validate(organizer_service._event_to_detail(ev))


@router.get("/events/{event_id}", response_model=OrganizerEventDetail)
async def get_my_event(
    event_id: int,
    session: AsyncSession = Depends(get_db),
    organizer_id: int = Depends(get_current_organizer_id),
):
    ev = await organizer_service.get_organizer_event(session, organizer_id, event_id)
    return OrganizerEventDetail.model_validate(organizer_service._event_to_detail(ev))


@router.patch("/events/{event_id}", response_model=OrganizerEventDetail)
async def update_event(
    event_id: int,
    payload: EventUpdateIn,
    session: AsyncSession = Depends(get_db),
    organizer_id: int = Depends(get_current_organizer_id),
):
    ev = await organizer_service.update_event(session, organizer_id, event_id, payload)
    await session.commit()
    return OrganizerEventDetail.model_validate(organizer_service._event_to_detail(ev))


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: int,
    session: AsyncSession = Depends(get_db),
    organizer_id: int = Depends(get_current_organizer_id),
):
    await organizer_service.delete_event(session, organizer_id, event_id)
    await session.commit()


@router.post("/events/{event_id}/publish", response_model=OrganizerEventDetail)
async def publish_event(
    event_id: int,
    session: AsyncSession = Depends(get_db),
    organizer_id: int = Depends(get_current_organizer_id),
):
    ev = await organizer_service.publish_event(session, organizer_id, event_id)
    await session.commit()
    return OrganizerEventDetail.model_validate(organizer_service._event_to_detail(ev))


@router.post("/uploads", response_model=UploadResponse)
async def upload_image(
    file: UploadFile = File(...),
    organizer_id: int = Depends(get_current_organizer_id),
):
    _ = organizer_id
    if not file.filename:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Файл не выбран")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Допустимы JPG, PNG, WebP, GIF")
    data = await file.read()
    if len(data) > MAX_BYTES:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Максимальный размер файла — 8 МБ")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    processed, out_ext = _process_upload(data, ext)
    name = f"{uuid.uuid4().hex}{out_ext}"
    path = UPLOAD_DIR / name
    path.write_bytes(processed)
    return {"url": f"/api/v1/media/{name}"}
