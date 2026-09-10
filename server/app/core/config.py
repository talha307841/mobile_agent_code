from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="AGENTDECK_", extra="ignore")

    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./agentdeck.db"
    jwt_secret: str = Field(default="development-only-change-me-minimum-32-bytes")
    jwt_issuer: str = "agentdeck"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    device_offline_seconds: int = 45
    allowed_origins: str = "http://localhost:8081"
    bootstrap_email: str | None = None
    bootstrap_password: str | None = None

    @property
    def cors_origins(self) -> list[str]:
        return [value.strip() for value in self.allowed_origins.split(",") if value.strip()]

    @model_validator(mode="after")
    def validate_production_secrets(self) -> "Settings":
        if self.environment == "production" and (
            len(self.jwt_secret) < 32 or "development" in self.jwt_secret
        ):
            raise ValueError("Production requires a random JWT secret of at least 32 characters")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
