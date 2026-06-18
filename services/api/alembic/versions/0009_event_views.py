"""event detail views

Revision ID: 0009_event_views
Revises: 0008_event_interactions
Create Date: 2026-06-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_event_views"
down_revision: Union[str, None] = "0008_event_interactions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "event_views",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_views_event_id", "event_views", ["event_id"])
    op.create_index("ix_event_views_created_at", "event_views", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_event_views_created_at", table_name="event_views")
    op.drop_index("ix_event_views_event_id", table_name="event_views")
    op.drop_table("event_views")
