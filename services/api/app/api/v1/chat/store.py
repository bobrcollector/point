from __future__ import annotations

import time
import uuid
from collections import defaultdict
from threading import Lock
from typing import Literal

from app.api.v1.chat.schemas import ChatMessage

WELCOME_TEXT = (
    "Здравствуйте! По вопросам входа и расписания пишите здесь — отвечу в ближайшее время."
)


class ChatStore:
    """In-memory chat history per event (demo / prototype)."""

    def __init__(self) -> None:
        self._rooms: dict[str, list[ChatMessage]] = defaultdict(list)
        self._lock = Lock()

    def list_messages(self, event_id: str) -> list[ChatMessage]:
        with self._lock:
            return list(self._rooms[event_id])

    def ensure_welcome(self, event_id: str, organizer_name: str) -> list[ChatMessage]:
        with self._lock:
            if self._rooms[event_id]:
                return list(self._rooms[event_id])
            row = ChatMessage(
                id=str(uuid.uuid4()),
                author=organizer_name or "Организатор",
                text=WELCOME_TEXT,
                role="organizer",
                at=int(time.time() * 1000),
            )
            self._rooms[event_id].append(row)
            return list(self._rooms[event_id])

    def add_message(
        self,
        event_id: str,
        *,
        author: str,
        text: str,
        role: Literal["participant", "organizer"],
    ) -> ChatMessage:
        row = ChatMessage(
            id=str(uuid.uuid4()),
            author=author,
            text=text.strip(),
            role=role,
            at=int(time.time() * 1000),
        )
        with self._lock:
            self._rooms[event_id].append(row)
        return row


chat_store = ChatStore()
