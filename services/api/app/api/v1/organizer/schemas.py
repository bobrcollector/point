from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

EventStatus = Literal["draft", "pending", "approved", "rejected", "cancelled"]


class TicketTypeIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: float = Field(ge=0)
    quantity: int = Field(ge=0)
    sort_order: int = 0


class TicketTypeOut(TicketTypeIn):
    id: int


class EventCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=500)
    description: str = Field(min_length=1)
    location: str = Field(min_length=1, max_length=500)
    address_detail: str = ""
    event_datetime: datetime
    category_ids: list[int] = Field(min_length=1)
    latitude: float | None = None
    longitude: float | None = None
    cover_image_url: str | None = None
    gallery_urls: list[str] = Field(default_factory=list)
    is_for_children: bool = False
    age_rating_min: int = Field(default=12, ge=0, le=18)
    requires_registration: bool = True
    status: EventStatus = "draft"
    ticket_types: list[TicketTypeIn] = Field(default_factory=list)

    @field_validator("age_rating_min")
    @classmethod
    def validate_age(cls, v: int, info):
        if v not in {0, 6, 12, 16, 18}:
            return 12
        return v


class EventUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=500)
    description: str | None = None
    location: str | None = Field(default=None, min_length=1, max_length=500)
    address_detail: str | None = None
    event_datetime: datetime | None = None
    category_ids: list[int] | None = None
    latitude: float | None = None
    longitude: float | None = None
    cover_image_url: str | None = None
    gallery_urls: list[str] | None = None
    is_for_children: bool | None = None
    age_rating_min: int | None = None
    requires_registration: bool | None = None
    status: EventStatus | None = None
    ticket_types: list[TicketTypeIn] | None = None


class OrganizerEventListItem(BaseModel):
    event_id: int
    title: str
    event_datetime: datetime
    location: str
    status: EventStatus
    price: float
    cover_image_url: str | None
    categories: list[dict[str, int | str]]
    ticket_types_count: int


class OrganizerEventsResponse(BaseModel):
    total: int
    items: list[OrganizerEventListItem]


class OrganizerEventDetail(BaseModel):
    event_id: int
    title: str
    description: str
    location: str
    address_detail: str
    event_datetime: datetime
    status: EventStatus
    price: float
    cover_image_url: str | None
    gallery_urls: list[str]
    latitude: float | None
    longitude: float | None
    is_for_children: bool
    age_rating_min: int
    requires_registration: bool
    organizer_name: str
    category_ids: list[int]
    categories: list[dict[str, int | str]]
    ticket_types: list[TicketTypeOut]
    created_at: datetime
    updated_at: datetime


class UploadResponse(BaseModel):
    url: str
