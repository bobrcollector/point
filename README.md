# Point — онлайн-платформа событий

Монорепозиторий для дипломного проекта: **PWA React** (каталог + интерактивная карта) и общий **FastAPI** бэкенд с **PostgreSQL + PostGIS**.

## Требования (что нужно установить)

- **Node.js** (у вас уже есть) + npm
- **Python 3.11+** (не из Microsoft Store; должен работать `python --version`)
- **Docker Desktop** (нужен для PostgreSQL/PostGIS локально)

Если при запуске `python` видите сообщение вроде *"No installed Python found"* — это заглушка Microsoft Store.
Решение: поставить Python с `python.org` и включить **Add python.exe to PATH**, либо отключить *App execution aliases* для Python в настройках Windows.

## Быстрый старт (фронтенд)

```bash
cd d:\point
npm install
npm run dev:web
```

Фронт поднимется на `http://localhost:5173`.

## Данные из базы в интерфейсе (веб + API)

Один раз (Docker, таблицы, демо-события):

```bash
cd d:\point
npm run setup:db
```

Убедитесь, что в `services/api` есть venv и `pip install -e .` (см. ниже «Бэкенд»).

Запуск фронта и API вместе (Vite проксирует `/api` на локальный uvicorn):

```bash
npm run dev:all
```

Откройте `http://localhost:5173` — список событий идёт из PostgreSQL.

## Переменные окружения

Скопируйте пример и вставьте ключи:

```bash
copy apps\web\.env.example apps\web\.env
```

## Прототип

Ваш текущий черновик страницы лежит в корне: `index.html`, `app.js`, `style.css`, `assets/`.
Он не удалён — используйте как референс при переносе в React.

## База данных (PostGIS)

```bash
cd d:\point\infra
docker compose up -d
```

Либо из корня: `npm run db:up`, затем `npm run db:migrate` и `npm run db:seed` (или одной командой `npm run setup:db`).

После первого поднятия контейнера примените миграции и (один раз) сид демо-данных — см. раздел **«Что нужно для работы с БД»** в `services/api/README.md` (`alembic upgrade head`, затем `python -m app.seed`).

## Бэкенд (FastAPI)

Файлы сервиса: `services/api`.

```bash
cd d:\point\services\api
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install -U pip
pip install -e .
uvicorn app.main:app --reload --port 8000
```


