# Point — онлайн-платформа событий

Монорепозиторий: **React PWA** + **FastAPI** + **PostgreSQL/PostGIS** (Docker).

## Быстрый старт

Полная инструкция: **[docs/START.md](docs/START.md)**

```powershell
cd d:\point
npm install
cd apps\web && npm install && cd ..\..
npm run setup:api    # venv + pip (если ещё не делали)
npm run setup:db     # Docker, миграции, демо-данные
npm run dev:all      # http://localhost:5173
```

**Админ:** `dev@point-demo.ru` / `dev12345`

## Требования

- Node.js + npm  
- Python 3.11+ (не Microsoft Store)  
- Docker Desktop  

## База данных

PostgreSQL в Docker на порту **5433** (чтобы не конфликтовать с локальным Postgres на 5432).

```powershell
npm run setup:db   # первый раз
npm run db:up      # только поднять контейнер
npm run db:reset   # полный сброс данных
```

Подробности: [services/api/README.md](services/api/README.md)

## Структура

| Путь | Описание |
|------|----------|
| `apps/web` | React + Vite |
| `services/api` | FastAPI |
| `infra` | Docker Compose (PostGIS) |
| `diplom` | исходный модуль диплома (референс) |
