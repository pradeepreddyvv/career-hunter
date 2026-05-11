from __future__ import annotations

from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PIPELINE_")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    secret_key: str = "change-me-in-production"  # JWT signing + API key encryption
    allowed_origins: List[str] = ["http://localhost:3000", "http://localhost:8000"]

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/pipeline.db"

    # Rate Limiting
    rate_limit_per_minute: int = 60
    gemini_concurrent_limit: int = 5

    # Background Tasks
    max_concurrent_pipelines: int = 3
    task_timeout_seconds: int = 600

    # Default Gemini model
    default_gemini_model: str = "gemini-2.5-pro"


settings = Settings()
