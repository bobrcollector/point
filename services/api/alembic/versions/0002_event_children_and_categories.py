"""event is_for_children; expand categories

Revision ID: 0002_children_categories
Revises: 0001_initial
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_children_categories"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

CATEGORY_ROWS: list[tuple[int, str]] = [
    (1, "Концерты"),
    (2, "Театр"),
    (3, "Выставки"),
    (4, "Кино"),
    (5, "Лекции"),
    (6, "Настолки"),
    (7, "Видеоигры"),
    (8, "Квизы"),
    (9, "Мастер-классы"),
    (10, "Рукоделие"),
    (11, "Командный спорт"),
    (12, "Фитнес/йога"),
    (13, "Бег/вело"),
    (14, "Единоборства"),
    (15, "Экстрим"),
    (16, "Фуд-фестивали"),
    (17, "Дегустации"),
    (18, "Ярмарки"),
    (19, "Акции магазинов"),
    (20, "Свопы"),
    (21, "Нетворкинг"),
    (22, "Языковые клубы"),
    (23, "Клубы по интересам"),
    (24, "Знакомства"),
    (25, "Городские праздники"),
    (26, "Музыкальные фестивали"),
    (27, "Уличная культура"),
    (28, "Детские фестивали"),
    (29, "Медитация"),
    (30, "Психологические группы"),
    (31, "Благотворительные забеги"),
]

LEGACY_RENAMES: list[tuple[str, str]] = [
    ("Концерт", "Концерты"),
    ("Спорт", "Командный спорт"),
    ("Лекция", "Лекции"),
    ("Игры", "Настолки"),
    ("Выставка", "Выставки"),
    ("Другое", "Клубы по интересам"),
]


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("events")}
    if "is_for_children" not in cols:
        op.add_column(
            "events",
            sa.Column("is_for_children", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        )

    for old_name, new_name in LEGACY_RENAMES:
        conn.execute(
            sa.text(
                "UPDATE categories SET name = :new_name "
                "WHERE name = :old_name "
                "AND NOT EXISTS (SELECT 1 FROM categories c2 WHERE c2.name = :new_name)"
            ),
            {"old_name": old_name, "new_name": new_name},
        )

    for cid, name in CATEGORY_ROWS:
        exists_name = conn.execute(
            sa.text("SELECT 1 FROM categories WHERE name = :name LIMIT 1"), {"name": name}
        ).first()
        if exists_name:
            continue
        exists_id = conn.execute(
            sa.text("SELECT 1 FROM categories WHERE id = :id LIMIT 1"), {"id": cid}
        ).first()
        if exists_id:
            next_id = conn.execute(sa.text("SELECT COALESCE(MAX(id), 0) + 1 FROM categories")).scalar()
            conn.execute(
                sa.text("INSERT INTO categories (id, name) VALUES (:id, :name)"),
                {"id": int(next_id), "name": name},
            )
        else:
            conn.execute(
                sa.text("INSERT INTO categories (id, name) VALUES (:id, :name)"),
                {"id": cid, "name": name},
            )


def downgrade() -> None:
    op.drop_column("events", "is_for_children")
