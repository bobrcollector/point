from __future__ import annotations

from sqlalchemy import ForeignKey, Identity, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EventTicketType(Base):
    __tablename__ = "event_ticket_types"

    id: Mapped[int] = mapped_column(Integer, Identity(always=False), primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    price: Mapped[float] = mapped_column(Numeric(12, 2), server_default="0")
    quantity: Mapped[int] = mapped_column(Integer, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")

    event: Mapped["Event"] = relationship("Event", back_populates="ticket_types")
