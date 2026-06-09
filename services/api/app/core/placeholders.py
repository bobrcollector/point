from __future__ import annotations

import hashlib
import re

PLACEHOLDER_FILENAME_RE = re.compile(r"^(cover|gallery)-\d+(?:-\d+)?\.svg$")

_PALETTE = [
    ("#6D28D9", "#A78BFA"),
    ("#2563EB", "#60A5FA"),
    ("#059669", "#34D399"),
    ("#D97706", "#FBBF24"),
    ("#DB2777", "#F472B6"),
    ("#0D9488", "#5EEAD4"),
]


def placeholder_cover_path(event_id: int) -> str:
    return f"/api/v1/placeholders/cover-{event_id}.svg"


def placeholder_gallery_paths(event_id: int) -> list[str]:
    return [f"/api/v1/placeholders/gallery-{event_id}-{i}.svg" for i in range(1, 4)]


def is_unreliable_remote_media(url: str | None) -> bool:
    if not url or not str(url).strip():
        return True
    value = str(url).strip().lower()
    if "picsum.photos" in value:
        return True
    if value.startswith("http://") or value.startswith("https://"):
        return (
            "/api/v1/media/" not in value
            and "/api/v1/placeholders/" not in value
            and "/uploads/" not in value
        )
    return False


def _colors_for_key(key: str) -> tuple[str, str]:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    idx = int(digest[:8], 16) % len(_PALETTE)
    return _PALETTE[idx]


def build_placeholder_svg(filename: str) -> str:
    if not PLACEHOLDER_FILENAME_RE.match(filename):
        raise ValueError("invalid placeholder filename")
    color_a, color_b = _colors_for_key(filename)
    label = filename.replace(".svg", "").replace("-", " ").title()
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{color_a}" />
      <stop offset="100%" stop-color="{color_b}" />
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#bg)" />
  <circle cx="1040" cy="140" r="120" fill="rgba(255,255,255,0.14)" />
  <circle cx="180" cy="680" r="180" fill="rgba(255,255,255,0.10)" />
  <text x="72" y="720" fill="rgba(255,255,255,0.92)" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="42" font-weight="700">{label}</text>
</svg>"""
