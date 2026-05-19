from app.services.notifications import (
    complaint_notification_content,
    moderation_notification_content,
)


def test_moderation_approved_no_reason_line():
    text = moderation_notification_content("Концерт", "approved", None)
    assert "Причина" not in text
    assert "approved" not in text
    assert "прошло модерацию" in text


def test_moderation_rejected_with_reason():
    text = moderation_notification_content("Концерт", "rejected", "Нарушение правил")
    assert "не прошло модерацию" in text
    assert "Причина: Нарушение правил" in text


def test_complaint_resolved_russian():
    text = complaint_notification_content("Фестиваль", "resolved")
    assert "resolved" not in text
    assert "рассмотрена" in text
