from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.core.placeholders import PLACEHOLDER_FILENAME_RE, build_placeholder_svg

router = APIRouter()


@router.get("/{filename}")
async def event_media_placeholder(filename: str) -> Response:
    if not PLACEHOLDER_FILENAME_RE.match(filename):
        raise HTTPException(status_code=404, detail="Изображение не найдено")
    svg = build_placeholder_svg(filename)
    return Response(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})
