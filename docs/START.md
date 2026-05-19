# Запуск Point (Windows)

Краткий гайд: база в Docker, API на Python, фронт на Vite.

## Что установить

| Компонент | Зачем |
|-----------|--------|
| [Node.js](https://nodejs.org/) LTS | фронт, npm-скрипты |
| [Python 3.11+](https://www.python.org/downloads/) | API (галочка **Add to PATH**) |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | PostgreSQL + PostGIS |

Проверка:

```powershell
node -v
python --version
docker --version
```

Если `python` открывает Microsoft Store — отключите *App execution aliases* для Python или установите Python с python.org.

---

## Первый запуск (один раз)

Откройте PowerShell в корне репозитория `d:\point`:

```powershell
cd d:\point

# 1. Зависимости Node
npm install
cd apps\web
npm install
cd ..\..

# 2. База: Docker + таблицы + демо-события
npm run setup:db
```

Скрипт `setup:db` сам:

- создаст `infra/.env` и обновит `services/api/.env` (порт **5433**);
- поднимет контейнер `point_db`;
- дождётся PostgreSQL;
- применит миграции Alembic;
- загрузит демо-данные.

**Учётная запись админа:** `dev@point-demo.ru` / `dev12345`

### Если что-то пошло не так с БД

Полный сброс (удалит все данные в Docker-томе):

```powershell
npm run db:reset
```

Только пересоздать таблицы без удаления тома:

```powershell
npm run db:up
npm run db:migrate
npm run db:seed
```

---

## Каждый день разработки

```powershell
cd d:\point

# Убедиться, что Docker запущен, затем:
npm run db:up          # если контейнер ещё не поднят

npm run dev:all        # API :8000 + фронт :5173
```

Откройте в браузере: **http://localhost:5173**

| URL | Назначение |
|-----|------------|
| http://localhost:5173 | приложение |
| http://127.0.0.1:8000/docs | Swagger API |
| http://127.0.0.1:8000/health/db | проверка связи с БД |

---

## Порты

| Сервис | Порт | Примечание |
|--------|------|------------|
| PostgreSQL (Docker) | **5433** на хосте | чтобы не мешать локальному Postgres на 5432 |
| FastAPI | 8000 | |
| Vite | 5173 | |

Строка подключения в `services/api/.env`:

```env
DATABASE_URL=postgresql+asyncpg://point:point@127.0.0.1:5433/point
```

Сменить порт: отредактируйте `POSTGRES_PORT` в `infra/.env`, затем `npm run setup:db` или `node scripts/ensure-api-env.mjs`.

---

## Полезные команды

```powershell
npm run db:up       # только Docker
npm run db:wait     # ждать готовности БД
npm run db:migrate  # миграции
npm run db:seed     # демо-данные
npm run setup:db    # всё сразу
npm run db:reset    # сброс тома + setup
npm run dev:api     # только API
npm run dev:web     # только фронт
npm run setup:api   # только venv + pip install -e .
```

---

## Фронт: ключ Яндекс.Карт (опционально)

```powershell
copy apps\web\.env.example apps\web\.env
```

Добавьте `VITE_YANDEX_MAPS_API_KEY=...` — без ключа карта может не работать, лента событий из БД всё равно откроется.

---

## Push-уведомления (опционально)

В `services/api` сгенерируйте VAPID (один раз):

```powershell
cd services\api
.\.venv\Scripts\activate
python -m py_vapid --gen --applicationServerKey
```

Скопируйте ключи в `services/api/.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY=private_key.pem`).
