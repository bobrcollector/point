"""initial users, categories, events

Revision ID: 0001_initial
Revises:
Create Date: 2026-02-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS postgis"))

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), autoincrement=False, nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), nullable=False, primary_key=True),
        sa.Column("organizer_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("event_datetime", sa.DateTime(timezone=True), nullable=False),
        sa.Column("location", sa.String(length=500), nullable=False),
        sa.Column("address_detail", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("organizer_name", sa.String(length=200), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("average_rating", sa.Numeric(4, 2), nullable=True),
        sa.Column("cover_image_url", sa.String(length=2000), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=True),
        sa.Column("longitude", sa.Float(), nullable=True),
        sa.Column("gallery_urls", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("participants_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organizer_id"], ["users.id"], ondelete="RESTRICT"),
    )
    op.create_index(op.f("ix_events_event_datetime"), "events", ["event_datetime"], unique=False)
    op.create_index(op.f("ix_events_organizer_id"), "events", ["organizer_id"], unique=False)

    op.create_table(
        "event_categories",
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("event_id", "category_id"),
    )


def downgrade() -> None:
    op.drop_table("event_categories")
    op.drop_index(op.f("ix_events_organizer_id"), table_name="events")
    op.drop_index(op.f("ix_events_event_datetime"), table_name="events")
    op.drop_table("events")
    op.drop_table("categories")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
