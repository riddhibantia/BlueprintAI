"""Built-in engineering-standards pack.

The RAG layer is only useful once it has something to retrieve. A new project
used to start with an empty knowledge base, so grounded generation did nothing
until the user invented a standards document. This pack ships with the app and
is ingested on project creation, which makes retrieval work on first load.

Every file is plain Markdown so it is chunked heading-by-heading and cites back
to its filename. Teams replace it by uploading their own standards; the pack is
a starting point, not a policy statement about their organisation.
"""
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.db import Document
from app.rag.ingest import ingest_text

STANDARDS_DIR = Path(__file__).resolve().parent / "standards"
DEFAULT_SOURCE = "default-pack"


def load_pack() -> list[dict]:
    """Read the pack from disk, sorted so seeding order is deterministic."""
    return [{"name": p.name, "text": p.read_text(encoding="utf-8")}
            for p in sorted(STANDARDS_DIR.glob("*.md"))]


def seed_default_standards(db: Session, project_id: str) -> dict:
    """Ingest the pack into one project. Safe to call repeatedly.

    Skips a file when a default-pack document with the same name already
    exists, so re-seeding never duplicates chunks. A user upload of the same
    name is left alone.
    """
    seeded, skipped = [], []
    for doc in load_pack():
        exists = db.query(Document).filter_by(
            project_id=project_id, name=doc["name"], source=DEFAULT_SOURCE
        ).first()
        if exists:
            skipped.append(doc["name"])
            continue
        result = ingest_text(db, project_id, name=doc["name"], text=doc["text"],
                             source=DEFAULT_SOURCE, agent="rag-seed")
        if result["status"] == "ingested":
            seeded.append(doc["name"])
        else:
            skipped.append(doc["name"])
    db.commit()
    return {"seeded": seeded, "skipped": skipped}
