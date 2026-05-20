from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_chat_websocket_history_and_send():
    event_id = "test-chat-99"
    with client.websocket_connect(
        f"/api/v1/chat/ws/{event_id}?display_name=Тест&organizer_name=Орг"
    ) as ws:
        history = ws.receive_json()
        assert history["type"] == "history"
        assert len(history["messages"]) >= 1
        assert history["messages"][0]["role"] == "organizer"

        ws.send_json({"type": "send", "text": "Привет"})
        msg = ws.receive_json()
        assert msg["type"] == "message"
        assert msg["message"]["text"] == "Привет"
        assert msg["message"]["role"] == "participant"


def test_chat_websocket_as_organizer_role():
    event_id = "test-chat-org-1"
    with client.websocket_connect(
        f"/api/v1/chat/ws/{event_id}?display_name=Мария&organizer_name=Студия&as_organizer=true"
    ) as ws:
        ws.receive_json()
        ws.send_json({"type": "send", "text": "Добрый день"})
        msg = ws.receive_json()
        assert msg["type"] == "message"
        assert msg["message"]["author"] == "Мария"
        assert msg["message"]["role"] == "organizer"


def test_chat_rest_history():
    event_id = "test-chat-rest-1"
    res = client.get(f"/api/v1/chat/events/{event_id}/messages", params={"organizer_name": "Org"})
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) >= 1
