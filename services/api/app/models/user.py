from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user_category import UserCategory


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), server_default="user", nullable=False)
    account_type: Mapped[str] = mapped_column(String(20), server_default="viewer", nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    organizer_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    verification_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verification_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reset_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notify_email: Mapped[bool] = mapped_column(Boolean, server_default="true", nullable=False)
    notify_push: Mapped[bool] = mapped_column(Boolean, server_default="false", nullable=False)
    locale: Mapped[str] = mapped_column(String(8), server_default="ru", nullable=False)
    profile_visibility: Mapped[str] = mapped_column(String(20), server_default="public", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    events: Mapped[list["Event"]] = relationship("Event", back_populates="organizer")
    interest_categories: Mapped[list["Category"]] = relationship(
        "Category",
        secondary=UserCategory.__table__,
        lazy="selectin",
    )
    organizer_requests: Mapped[list["OrganizerRequest"]] = relationship(
        "OrganizerRequest",
        foreign_keys="OrganizerRequest.user_id",
        back_populates="user",
        lazy="selectin",
    )
