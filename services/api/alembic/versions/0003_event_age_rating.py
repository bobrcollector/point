"""event age_rating_min

Revision ID: 0003_age_rating
Revises: 0002_children_categories
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_age_rating"
down_revision = "0002_children_categories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("events")}
    if "age_rating_min" not in cols:
        op.add_column(
            "events",
            sa.Column("age_rating_min", sa.Integer(), server_default=sa.text("12"), nullable=False),
        )
        conn.execute(
            sa.text(
                "UPDATE events SET age_rating_min = 0 WHERE is_for_children = true"
            )
        )


def downgrade() -> None:
    op.drop_column("events", "age_rating_min")
