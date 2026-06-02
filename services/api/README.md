# Point API (FastAPI)

## База данных

Из **корня** репозитория:

```powershell
npm run setup:db
```

Или по шагам:

```powershell
npm run db:up
npm run db:migrate
npm run db:seed
```

### Подключение

Файл `services/api/.env` (создаётся автоматически скриптом `ensure-api-env`):

```env
DATABASE_URL=postgresql+asyncpg://point:point@127.0.0.1:5433/point
```

Порт задаётся в `infra/.env` → `POSTGRES_PORT=5433`.

### Проверка

- http://127.0.0.1:8000/health  
- http://127.0.0.1:8000/health/db  
- http://127.0.0.1:8000/docs  

### Демо-данные

- Пользователь: `dev@point-demo.ru` / `dev12345` (роль admin)  
- События id 101–130 в статусе `approved` (видны в ленте)  

Повторный `npm run db:seed` не дублирует события, но обновляет даты и добавляет новые id из seed.

## Python venv (вручную)

```powershell
cd d:\point\services\api
python -m venv .venv
.\.venv\Scripts\activate
pip install -U pip
pip install -e .
```

Или из корня: `npm run setup:api`

## Запуск API

Из корня: `npm run dev:api`

Или вручную:

```powershell
cd d:\point\services\api
.\.venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
