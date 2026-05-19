from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Notification, PushSubscription, User

logger = logging.getLogger(__name__)

_API_DIR = Path(__file__).resolve().parents[2]


def _vapid_private_key() -> str:
    raw = settings.vapid_private_key.strip()
    if not raw:
        return ""
    path = Path(raw)
    if not path.is_absolute():
        path = _API_DIR / path
    if path.is_file():
        return path.read_text(encoding="utf-8")
    return raw


async def create_notification(
    session: AsyncSession,
    *,
    user_id: int,
    n_type: str,
    content: str,
    send_push: bool = True,
    push_title: str | None = None,
) -> Notification:
    row = Notification(user_id=user_id, type=n_type, content=content)
    session.add(row)
    await session.flush()
    if send_push:
        user = await session.get(User, user_id)
        if user and user.notify_push:
            await _send_push_to_user(
                session,
                user_id=user_id,
                title=push_title or _push_title(n_type),
                body=content,
            )
    return row


def moderation_notification_content(event_title: str, status: str, reason: str | None = None) -> str:
    """Текст уведомления организатору о результате модерации (только русский)."""
    title = event_title.strip() or "Событие"
    if status == "approved":
        return f"Событие «{title}» прошло модерацию и опубликовано в каталоге."
    if status == "rejected":
        base = f"Событие «{title}» не прошло модерацию."
        reason_clean = (reason or "").strip()
        if reason_clean:
            return f"{base} Причина: {reason_clean}"
        return base
    if status == "pending":
        return f"Событие «{title}» отправлено на модерацию. Сообщим, когда проверка завершится."
    return f"Статус события «{title}» обновлён."


def moderation_push_title(status: str) -> str:
    if status == "approved":
        return "Событие опубликовано"
    if status == "rejected":
        return "Модерация отклонена"
    if status == "pending":
        return "На модерации"
    return "Модерация события"


def complaint_notification_content(event_title: str, status: str) -> str:
    """Текст уведомления автору жалобы (только русский)."""
    title = event_title.strip() or "Событие"
    if status == "resolved":
        return f"Ваша жалоба на событие «{title}» рассмотрена. Спасибо, что помогаете поддерживать качество афиши."
    if status == "rejected":
        return f"Жалоба на событие «{title}» закрыта: по итогам проверки меры не потребовались."
    if status == "pending":
        return f"Жалоба на событие «{title}» принята и ожидает рассмотрения."
    return f"Статус жалобы на событие «{title}» обновлён."


def complaint_push_title(status: str) -> str:
    if status == "resolved":
        return "Жалоба рассмотрена"
    if status == "rejected":
        return "Жалоба закрыта"
    return "Жалоба"


def _push_title(n_type: str) -> str:
    labels = {
        "moderation_status": "Модерация",
        "event_reminder": "Напоминание",
        "complaint_created": "Жалоба",
        "complaint_resolved": "Жалоба рассмотрена",
        "complaint_rejected": "Жалоба закрыта",
        "chat_message": "Чат",
    }
    return labels.get(n_type, "Point")


async def _send_push_to_user(session: AsyncSession, *, user_id: int, title: str, body: str) -> None:
    private_key = _vapid_private_key()
    if not private_key or not settings.vapid_public_key:
        return
    subs = (await session.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))).scalars().all()
    if not subs:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed; skip push")
        return

    payload = json.dumps({"title": title, "body": body[:240]})
    vapid_claims = {"sub": settings.vapid_claims_email}
    dead: list[PushSubscription] = []
    for sub in subs:
        subscription_info: dict[str, Any] = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=vapid_claims,
            )
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                dead.append(sub)
            else:
                logger.debug("push failed for user %s: %s", user_id, exc)
    for sub in dead:
        await session.delete(sub)
