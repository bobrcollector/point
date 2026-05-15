from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Identity, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import text

from app.db.base import Base
from app.models.association import event_categories


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, Identity(always=False), primary_key=True)
    organizer_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    event_datetime: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    location: Mapped[str] = mapped_column(String(500))
    address_detail: Mapped[str] = mapped_column(Text())
    description: Mapped[str] = mapped_column(Text())
    organizer_name: Mapped[str] = mapped_column(String(200))
    price: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    average_rating: Mapped[float | None] = mapped_column(Numeric(4, 2), nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    gallery_urls: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    participants_count: Mapped[int] = mapped_column(Integer, server_default="0")
    is_for_children: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    age_rating_min: Mapped[int] = mapped_column(Integer, server_default="12", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    organizer: Mapped["User"] = relationship("User", back_populates="events")
    categories: Mapped[list["Category"]] = relationship(
        "Category",
        secondary=event_categories,
        back_populates="events",
    )
