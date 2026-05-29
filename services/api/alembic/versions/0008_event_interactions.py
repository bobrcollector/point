"""event favorites participations reviews

Revision ID: 0008_event_interactions
Revises: 0007_diplom_admin_notifications
Create Date: 2026-05-25
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_event_interactions"
down_revision: Union[str, None] = "0007_diplom_admin_notifications"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_favorites",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "event_id"),
    )
    op.create_index("ix_event_favorites_event_id", "event_favorites", ["event_id"])

    op.create_table(
        "event_participations",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "event_id"),
    )
    op.create_index("ix_event_participations_event_id", "event_participations", ["event_id"])

    op.create_table(
        "event_reviews",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("author", sa.String(length=120), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "user_id", name="uq_event_reviews_event_user"),
    )
    op.create_index("ix_event_reviews_event_id", "event_reviews", ["event_id"])
    op.create_index("ix_event_reviews_user_id", "event_reviews", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_event_reviews_user_id", table_name="event_reviews")
    op.drop_index("ix_event_reviews_event_id", table_name="event_reviews")
    op.drop_table("event_reviews")
    op.drop_index("ix_event_participations_event_id", table_name="event_participations")
    op.drop_table("event_participations")
    op.drop_index("ix_event_favorites_event_id", table_name="event_favorites")
    op.drop_table("event_favorites")
