from pathlib import Path

from app.core.config import settings


def abs_media_url(path: str | None) -> str | None:
    if not path or not str(path).strip():
        return None
    p = str(path).strip()
    if p.startswith("http://") or p.startswith("https://"):
        return p
    base = settings.api_public_url.rstrip("/")
    return f"{base}{p if p.startswith('/') else '/' + p}"


def local_upload_path(stored_url: str) -> Path | None:
    name = stored_url.rsplit("/", 1)[-1]
    if not name or ".." in name:
        return None
    if "/media/" in stored_url or stored_url.startswith("/uploads/"):
        return Path(settings.upload_dir) / name
    return None


def upload_file_exists(stored_url: str | None) -> bool:
    if not stored_url:
        return False
    path = local_upload_path(stored_url)
    return path.is_file() if path else False
