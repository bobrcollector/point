"""organizer: event status, tickets, registration flag

Revision ID: 0006_organizer
Revises: 0005_account_type
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_organizer"
down_revision = "0005_account_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("status", sa.String(length=20), server_default="published", nullable=False),
    )
    op.add_column(
        "events",
        sa.Column("requires_registration", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "events",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_events_status", "events", ["status"])

    op.create_table(
        "event_ticket_types",
        sa.Column("id", sa.Integer(), sa.Identity(always=False), primary_key=True),
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("price", sa.Numeric(12, 2), server_default="0", nullable=False),
        sa.Column("quantity", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_event_ticket_types_event_id", "event_ticket_types", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_event_ticket_types_event_id", table_name="event_ticket_types")
    op.drop_table("event_ticket_types")
    op.drop_index("ix_events_status", table_name="events")
    op.drop_column("events", "updated_at")
    op.drop_column("events", "requires_registration")
    op.drop_column("events", "status")
