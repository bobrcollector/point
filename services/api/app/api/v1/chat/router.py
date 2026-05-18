from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.api.v1.chat.manager import chat_manager
from app.api.v1.chat.schemas import ClientSendPayload, ErrorPayload, MessagePayload
from app.api.v1.chat.store import chat_store

router = APIRouter()


@router.get("/events/{event_id}/messages")
async def get_chat_messages(event_id: str, organizer_name: str = Query(default="Организатор")):
    """REST: история чата (удобно для отладки без WebSocket)."""
    messages = chat_store.ensure_welcome(event_id, organizer_name)
    return {"items": [m.model_dump() for m in messages]}


@router.websocket("/ws/{event_id}")
async def chat_websocket(
    websocket: WebSocket,
    event_id: str,
    display_name: str = Query(default="Гость"),
    organizer_name: str = Query(default="Организатор"),
):
    name = (display_name or "Гость").strip()[:120] or "Гость"
    org = (organizer_name or "Организатор").strip()[:120] or "Организатор"
    room = event_id.strip()
    if not room:
        await websocket.close(code=4400)
        return

    await chat_manager.connect(room, websocket)
    try:
        await chat_manager.send_history(room, websocket, org)
        while True:
            raw = await websocket.receive_json()
            try:
                payload = ClientSendPayload.model_validate(raw)
            except ValidationError:
                await websocket.send_json(ErrorPayload(detail="Неверный формат сообщения").model_dump())
                continue

            row = chat_store.add_message(
                room,
                author=name,
                text=payload.text,
                role="participant",
            )
            await chat_manager.broadcast_message(room, MessagePayload(message=row))
    except WebSocketDisconnect:
        pass
    finally:
        chat_manager.disconnect(room, websocket)
