"""account_type and organizer_description

Revision ID: 0005_account_type
Revises: 0004_auth_profile
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_account_type"
down_revision = "0004_auth_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("account_type", sa.String(length=20), server_default="viewer", nullable=False),
    )
    op.add_column("users", sa.Column("organizer_description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "organizer_description")
    op.drop_column("users", "account_type")
