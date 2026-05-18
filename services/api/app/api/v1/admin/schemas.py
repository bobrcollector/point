from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class OrganizerRequestAdmin(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_display_name: str
    status: str
    description: str
    document_path: str
    admin_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None


class OrganizerRequestsList(BaseModel):
    items: list[OrganizerRequestAdmin]


class ReviewOrganizerRequest(BaseModel):
    status: str = Field(pattern="^(approved|rejected)$")
    admin_note: str | None = Field(default=None, max_length=2000)
