from pydantic import BaseModel


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


class EventsResponse(BaseModel):
    total: int
    items: list[EventItem]


class CategoriesResponse(BaseModel):
    items: list[Category]

