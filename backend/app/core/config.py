"""Central app settings. Source of truth: .env (see .env.example)."""
import logging

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger("devblueprint.config")

DEV_JWT_DEFAULT = "change-me-dev-secret-min-32-chars-long!!"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATABASE_URL: str = "sqlite:///./devblueprint.db"
    JWT_SECRET: str = DEV_JWT_DEFAULT
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    LLM_PROVIDER: str = "mock"  # mock | openai
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_BASE_URL: str = ""  # any OpenAI-compatible endpoint (Gemini, Groq, OpenRouter…)
    LLM_API_KEY: str = ""  # Copilot: any OpenAI-compatible provider (OpenAI, Gemini, Groq…)
    LLM_BASE_URL: str = ""  # e.g. https://generativelanguage.googleapis.com/v1beta/openai/
    LLM_MODEL: str = ""  # defaults to OPENAI_MODEL when empty
    GEMINI_API_KEY: str = ""  # alias: accepted as copilot key when LLM_API_KEY is empty
    EMBEDDING_PROVIDER: str = "hash"  # hash | openai
    OPENAI_EMBED_MODEL: str = "text-embedding-3-small"
    STORAGE_MODE: str = "local"
    UPLOAD_DIR: str = "./uploads"
    S3_BUCKET: str = ""
    AWS_REGION: str = ""
    ENV: str = "dev"
    CORS_ORIGINS: str = "http://localhost:3000"

    @field_validator("JWT_SECRET")
    @classmethod
    def _secret_strength(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return v

    @field_validator("ACCESS_TOKEN_EXPIRE_MINUTES")
    @classmethod
    def _ttl_sane(cls, v: int) -> int:
        if v < 5 or v > 1440:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be 5..1440")
        return v

    @model_validator(mode="after")
    def _fail_closed_in_prod(self) -> "Settings":
        prod = self.ENV.lower() in ("prod", "production")
        if prod:
            if self.JWT_SECRET == DEV_JWT_DEFAULT:
                raise ValueError("Refusing to boot in prod with the default dev JWT_SECRET — set a unique secret")
            if self.CORS_ORIGINS.strip() in ("*", "http://*,https://*"):
                raise ValueError("Refusing to boot in prod with wildcard CORS_ORIGINS + credentials")
            if not self.DATABASE_URL.startswith(("postgresql", "postgres")):
                log.warning("ENV=prod but DATABASE_URL is not Postgres — running prod on SQLite is unsupported")
        if self.LLM_PROVIDER == "openai" and not self.OPENAI_API_KEY:
            log.warning("LLM_PROVIDER=openai but OPENAI_API_KEY is empty — generations will use mock fallback")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith(("postgresql", "postgres"))

    @property
    def use_openai(self) -> bool:
        return bool(self.OPENAI_API_KEY) and self.LLM_PROVIDER == "openai"

    @property
    def copilot_model(self) -> str:
        """Model for the Copilot adapter (provider-agnostic)."""
        return self.LLM_MODEL or self.OPENAI_MODEL

    @property
    def copilot_configured(self) -> bool:
        """True only when a key exists — otherwise the rule-based Copilot serves."""
        return bool(self.LLM_API_KEY or self.OPENAI_API_KEY)


settings = Settings()
