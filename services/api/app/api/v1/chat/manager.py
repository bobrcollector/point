from __future__ import annotations

from collections import defaultdict

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

from app.api.v1.chat.schemas import HistoryPayload, MessagePayload
from app.api.v1.chat.store import chat_store


class ChatConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, event_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[event_id].append(websocket)

    def disconnect(self, event_id: str, websocket: WebSocket) -> None:
        conns = self._connections.get(event_id)
        if not conns:
            return
        try:
            conns.remove(websocket)
        except ValueError:
            pass
        if not conns:
            self._connections.pop(event_id, None)

    async def send_history(self, event_id: str, websocket: WebSocket, organizer_name: str) -> None:
        messages = chat_store.ensure_welcome(event_id, organizer_name)
        await websocket.send_json(HistoryPayload(messages=messages).model_dump())

    async def broadcast_message(self, event_id: str, payload: MessagePayload) -> None:
        body = payload.model_dump()
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(event_id, [])):
            try:
                await ws.send_json(body)
            except (WebSocketDisconnect, RuntimeError):
                dead.append(ws)
        for ws in dead:
            self.disconnect(event_id, ws)


chat_manager = ChatConnectionManager()
