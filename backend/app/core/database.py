"""DB engine/session. Postgres+pgvector when DATABASE_URL is postgres, else SQLite fallback (8GB-friendly)."""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings


def normalize_url(url: str) -> str:
    """Accept PaaS-issued URLs: bare postgres:// becomes postgresql+psycopg://
    (psycopg v3 is what's installed — plain postgres:// would resolve psycopg2)."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = normalize_url(settings.DATABASE_URL)
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import db as _models  # noqa: F401  (register tables)
    Base.metadata.create_all(bind=engine)
    if settings.is_postgres:
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                conn.commit()
        except Exception:
            pass  # pgvector optional; vector search degrades to lexical
