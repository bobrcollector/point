from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models import User

bearer = HTTPBearer(auto_error=False)

ROLE_RANK = {"user": 1, "admin": 2}


async def get_current_user_optional(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_db),
) -> User | None:
    if creds is None or creds.scheme.lower() != "bearer":
        return None
    payload = decode_access_token(creds.credentials)
    if payload is None:
        return None
    user_id = payload.get("uid")
    if not isinstance(user_id, int):
        return None
    user = await session.get(User, user_id)
    if user is None:
        return None
    if user.is_banned:
        return None
    return user


async def get_current_user(user: User | None = Depends(get_current_user_optional)) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Требуется авторизация")
    return user


def require_roles(*roles: str):
    async def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles and not _role_at_least(user.role, roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return user

    return _guard


def _role_at_least(user_role: str, allowed: tuple[str, ...]) -> bool:
    user_rank = ROLE_RANK.get(user_role, 0)
    needed = min(ROLE_RANK.get(r, 99) for r in allowed)
    return user_rank >= needed and user_rank >= needed


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ только для администратора")
    return user


_LOCAL_ADMIN_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient"})


async def require_admin_local(request: Request, user: User = Depends(require_admin)) -> User:
    if settings.admin_allow_remote:
        return user
    client_host = (request.client.host if request.client else "").lower()
    if client_host not in _LOCAL_ADMIN_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Админ-панель доступна только с этого компьютера",
        )
    return user


async def require_moderator(user: User = Depends(require_admin_local)) -> User:
    """Совместимость: модерация только у admin."""
    return user
