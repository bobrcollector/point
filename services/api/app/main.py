from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.catalog.router import router as catalog_router
from app.api.v1.organizer.router import router as organizer_router
from app.core.config import settings
from app.db.session import engine, get_db

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(title="Point API", version="0.1.0", lifespan=lifespan)

    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(catalog_router, prefix="/api/v1/catalog", tags=["catalog"])
    app.include_router(organizer_router, prefix="/api/v1/organizer", tags=["organizer"])
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    app.mount("/api/v1/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/health/db")
    async def health_db(db: AsyncSession = Depends(get_db)):
        await db.execute(text("SELECT 1"))
        return {"ok": True, "database": "connected"}

    return app


app = create_app()
