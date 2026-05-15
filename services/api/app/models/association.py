from sqlalchemy import Column, ForeignKey, Integer, Table

from app.db.base import Base

event_categories = Table(
    "event_categories",
    Base.metadata,
    Column("event_id", Integer, ForeignKey("events.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
)
