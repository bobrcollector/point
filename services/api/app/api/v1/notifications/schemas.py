from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class NotificationOut(BaseModel):
    notification_id: int
    type: str
    content: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
