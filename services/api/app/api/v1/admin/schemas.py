from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class AdminUserOut(BaseModel):
    user_id: int
    email: str
    role: str
    is_banned: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RoleUpdate(BaseModel):
    role: str = Field(pattern="^(user|admin)$")


class ModerateEventPayload(BaseModel):
    decision: str
    reason: str | None = None
    block_organizer: bool = False

    @field_validator("decision")
    @classmethod
    def normalize_decision(cls, v: str) -> str:
        d = v.strip().lower()
        if d not in ("approve", "reject", "approved", "rejected"):
            raise ValueError("invalid_decision")
        if d in ("approved", "approve"):
            return "approve"
        return "reject"


class AdminEventOut(BaseModel):
    event_id: int
    organizer_id: int
    title: str
    description: str
    event_datetime: datetime
    location: str
    status: str
    moderation_reason: str | None = None
    is_hidden: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ComplaintAdminOut(BaseModel):
    complaint_id: int
    user_id: int
    event_id: int
    reason: str
    status: str
    created_at: datetime
    user_name: str
    event_title: str

    model_config = {"from_attributes": True}


class ResolveComplaintPayload(BaseModel):
    decision: str
    hide_event: bool = False
    block_organizer: bool = False

    @field_validator("decision")
    @classmethod
    def normalize_status(cls, v: str) -> str:
        s = v.strip().lower()
        if s in ("resolve", "resolved", "approve", "approved"):
            return "resolved"
        if s in ("reject", "rejected"):
            return "rejected"
        raise ValueError("invalid_decision")


class ChartPoint(BaseModel):
    label: str
    count: int


class RatingChartPoint(BaseModel):
    label: str
    value: float | None = None


class DashboardMetrics(BaseModel):
    total_users: int
    total_events: int
    active_events_today: int
    active_events_today_or_future: int
    new_complaints: int
    pending_events: int
    banned_users: int
    upcoming_events: int
    total_participations: int
    total_reviews: int
    avg_event_rating: float | None = None
