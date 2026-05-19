from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://point:point@127.0.0.1:5433/point"
    cors_origins: str = "http://localhost:5173"
    jwt_secret: str = "change-me-in-production-point-diploma"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    app_public_url: str = "http://localhost:5173"
    api_public_url: str = "http://127.0.0.1:8000"
    upload_dir: str = "uploads"
    max_upload_bytes: int = 5 * 1024 * 1024
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_claims_email: str = "mailto:admin@point.local"


settings = Settings()

