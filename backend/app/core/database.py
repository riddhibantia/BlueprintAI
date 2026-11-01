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


def _engine_for(url: str):
    """Throwaway engine for migrating a database other than the configured one."""
    args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=args, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.models import db as _models  # noqa: F401  (register tables)
    Base.metadata.create_all(bind=engine)
    migrate_schema(settings.DATABASE_URL)
    if settings.is_postgres:
        try:
            with engine.connect() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
                conn.commit()
        except Exception:
            pass  # pgvector optional; vector search degrades to lexical


# Columns added after the first release. `create_all()` creates missing tables
# but never alters an existing one, so an install that predates a column would
# 500 on the first query while a fresh test database stayed green. Each entry
# is (table, column, DDL type, backfill expression) and is applied only when
# the column is genuinely absent, which keeps the step idempotent.
_ADDED_COLUMNS: list[tuple[str, str, str, str]] = [
    ("users", "password_changed_at", "TIMESTAMP", "CURRENT_TIMESTAMP"),
]


def migrate_schema(database_url: str = "") -> list[str]:
    """Apply additive column migrations to an existing database.

    Deliberately tiny and additive-only: this is the seam that keeps installed
    databases working until a real migration tool (Alembic) is adopted. It never
    drops or rewrites anything, and existing rows are backfilled so comparisons
    against the new column behave.
    """
    from sqlalchemy import inspect as _inspect

    url = normalize_url(database_url or settings.DATABASE_URL)
    applied: list[str] = []
    # An explicit URL means "migrate that database", so build a throwaway engine
    # rather than reusing the module-level one bound to settings.DATABASE_URL.
    target = engine if url == DATABASE_URL else _engine_for(url)
    try:
        insp = _inspect(target)
        existing_tables = set(insp.get_table_names())
    except Exception:
        return applied  # engine not reachable: boot will surface it elsewhere

    with target.connect() as conn:
        for table, column, ddl_type, backfill in _ADDED_COLUMNS:
            if table not in existing_tables:
                continue  # create_all just made it with the column included
            try:
                cols = {c["name"] for c in insp.get_columns(table)}
            except Exception:
                continue
            if column in cols:
                continue
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
                conn.execute(text(f"UPDATE {table} SET {column} = {backfill} WHERE {column} IS NULL"))
                conn.commit()
                applied.append(f"{table}.{column}")
            except Exception:
                conn.rollback()  # a racing boot already added it
    return applied
