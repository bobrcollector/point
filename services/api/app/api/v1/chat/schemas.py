from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    id: str
    author: str
    text: str
    role: Literal["participant", "organizer"]
    at: int = Field(description="Unix timestamp in milliseconds")


class HistoryPayload(BaseModel):
    type: Literal["history"] = "history"
    messages: list[ChatMessage]


class MessagePayload(BaseModel):
    type: Literal["message"] = "message"
    message: ChatMessage


class ErrorPayload(BaseModel):
    type: Literal["error"] = "error"
    detail: str


class ClientSendPayload(BaseModel):
    type: Literal["send"] = "send"
    text: str = Field(min_length=1, max_length=4000)
