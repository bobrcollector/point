from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ComplaintCreate(BaseModel):
    event_id: int
    reason: str = Field(min_length=3, max_length=255)


class ComplaintOut(BaseModel):
    complaint_id: int
    user_id: int
    event_id: int
    reason: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
