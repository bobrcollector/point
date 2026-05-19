"""Event owner API auth helpers."""

from fastapi import Depends

from app.core.deps import get_current_user
from app.models import User


async def get_current_organizer_id(user: User = Depends(get_current_user)) -> int:
    """ID владельца события (любой авторизованный пользователь)."""
    return int(user.id)
