from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.association import event_categories


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(80), unique=True)

    events: Mapped[list["Event"]] = relationship(
        "Event",
        secondary=event_categories,
        back_populates="categories",
    )
