# Point API (FastAPI)

## Что нужно для работы с БД

1. **PostGIS в Docker** (PostgreSQL уже внутри образа):

```powershell
cd d:\point\infra
docker compose up -d
```

2. **Переменные окружения** (опционально): скопируйте `.env.example` в `.env` в этой папке и при необходимости измените `DATABASE_URL`.

3. **Миграции** (создают таблицы `users`, `categories`, `events`, `event_categories` и расширение PostGIS):

```powershell
cd d:\point\services\api
.\.venv\Scripts\activate
pip install -e .
alembic upgrade head
```

4. **Демо-данные** (категории, пользователь `dev@point.local`, события с id 101–114 как раньше в моках):

```powershell
python -m app.seed
```

Повторный запуск сида ничего не дублирует: если событие `101` уже есть, скрипт выходит.

## Запуск API

```powershell
cd d:\point\services\api
.\.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Проверки:

- `http://localhost:8000/health` — процесс жив.
- `http://localhost:8000/health/db` — соединение с PostgreSQL.
- Swagger: `http://localhost:8000/docs`.

Каталог (`/api/v1/catalog/events` и др.) читает данные **из базы**, не из заглушек в коде.

## Из корня репозитория (`d:\point`)

Один раз: поднять PostGIS, миграции и демо-события:

```powershell
npm run setup:db
```

Затем веб и API вместе (фронт в dev проксирует `/api` на `http://127.0.0.1:8000`):

```powershell
npm run dev:all
```
