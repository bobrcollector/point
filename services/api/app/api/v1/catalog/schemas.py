from pydantic import BaseModel
from pydantic import Field


class Category(BaseModel):
    id: int
    name: str


class EventItem(BaseModel):
    event_id: int
    title: str
    event_datetime: str
    location: str
    price: float
    average_rating: float | None = None
    cover_image_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    distance: int | None = None
    is_for_children: bool = False
    age_rating_min: int = 12
    categories: list[Category] = []


class TicketTypePublic(BaseModel):
    id: int
    name: str
    price: float
    quantity: int


class EventDetail(EventItem):
    """Полная карточка события для страницы мероприятия."""

    description: str
    address_detail: str
    organizer_id: int
    organizer_name: str
    gallery_urls: list[str] = []
    participants_count: int = 0
    requires_registration: bool = True
    ticket_types: list[TicketTypePublic] = []


class EventInteractionState(BaseModel):
    favorite_event_ids: list[int]
    participating_event_ids: list[int]


class EventInteractionUpdate(BaseModel):
    enabled: bool


class EventInteractionOut(BaseModel):
    event_id: int
    is_favorite: bool
    is_participating: bool


class EventReviewCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    rating: int = Field(ge=1, le=5)


class EventReviewOut(BaseModel):
    review_id: int
    event_id: int
    user_id: int
    author: str
    text: str
    rating: int
    created_at: str


class EventsResponse(BaseModel):
    total: int
    items: list[EventItem]


class CategoriesResponse(BaseModel):
    items: list[Category]

