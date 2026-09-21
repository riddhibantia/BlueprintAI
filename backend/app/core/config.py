"""Central app settings. Source of truth: .env (see .env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATABASE_URL: str = "sqlite:///./devblueprint.db"
    JWT_SECRET: str = "change-me-dev-secret-min-32-chars-long!!"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720
    LLM_PROVIDER: str = "mock"  # mock | openai
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_PROVIDER: str = "hash"  # hash | openai
    OPENAI_EMBED_MODEL: str = "text-embedding-3-small"
    STORAGE_MODE: str = "local"
    UPLOAD_DIR: str = "./uploads"
    ENV: str = "dev"
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith(("postgresql", "postgres"))

    @property
    def use_openai(self) -> bool:
        return bool(self.OPENAI_API_KEY) and self.LLM_PROVIDER == "openai"


settings = Settings()
