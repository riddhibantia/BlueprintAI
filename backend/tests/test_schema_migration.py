"""Schema upgrades must survive an existing database.

`Base.metadata.create_all()` only creates missing *tables* — it never adds a
column to a table that already exists. Adding `users.password_changed_at`
therefore broke every existing install (the app 500s on the first user query)
while the whole test suite stayed green, because tests always start from a
fresh file. These tests pin the upgrade path specifically.
"""
import sqlite3

from app.core.database import migrate_schema


def _legacy_users_table(path: str) -> None:
    """A users table as it existed before password_changed_at was introduced."""
    c = sqlite3.connect(path)
    c.execute("""CREATE TABLE users (
        id VARCHAR PRIMARY KEY, email VARCHAR NOT NULL, password_hash VARCHAR NOT NULL,
        name VARCHAR, created_at DATETIME, updated_at DATETIME)""")
    c.execute("INSERT INTO users (id, email, password_hash, name) VALUES ('u1','old@x.io','hash','Old')")
    c.commit()
    c.close()


def test_migration_adds_missing_column_to_existing_table(tmp_path):
    db = tmp_path / "legacy.db"
    _legacy_users_table(str(db))
    c = sqlite3.connect(str(db))
    assert "password_changed_at" not in [r[1] for r in c.execute("PRAGMA table_info(users)")]
    c.close()

    migrate_schema(f"sqlite:///{db}")

    c = sqlite3.connect(str(db))
    cols = [r[1] for r in c.execute("PRAGMA table_info(users)")]
    # existing data must survive the upgrade
    rows = c.execute("SELECT email FROM users").fetchall()
    c.close()
    assert "password_changed_at" in cols
    assert rows == [("old@x.io",)]


def test_migration_is_idempotent(tmp_path):
    db = tmp_path / "again.db"
    _legacy_users_table(str(db))
    migrate_schema(f"sqlite:///{db}")
    migrate_schema(f"sqlite:///{db}")  # must not raise on a second boot
    c = sqlite3.connect(str(db))
    cols = [r[1] for r in c.execute("PRAGMA table_info(users)")]
    c.close()
    assert cols.count("password_changed_at") == 1


def test_legacy_user_can_log_in_after_migration(tmp_path):
    """The real symptom: an existing account must not 500 after upgrading."""
    db = tmp_path / "login.db"
    _legacy_users_table(str(db))
    migrate_schema(f"sqlite:///{db}")
    c = sqlite3.connect(str(db))
    row = c.execute("SELECT email, password_changed_at FROM users").fetchone()
    c.close()
    assert row[0] == "old@x.io"
    # backfilled with a concrete timestamp, not NULL, so comparisons work
    assert row[1] is not None
