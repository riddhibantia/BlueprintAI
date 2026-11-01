"""Project-scoped retrieval context shared by every generation stage.

One query shape means citations always name the source document (not an opaque
id) and every stage sees the same chunk window. Keeping this in one place also
stops the per-route copies from drifting apart.
"""
from sqlalchemy.orm import Session

from app.models.db import Document, DocumentChunk
from app.rag.retriever import retrieve

MAX_CONTEXT_CHUNKS = 300
EXCERPT_CHARS = 500


def project_chunks(db: Session, project_id: str,
                   limit: int = MAX_CONTEXT_CHUNKS) -> list[dict]:
    """Stored chunks for one project, shaped for `retrieve()`."""
    rows = (db.query(DocumentChunk, Document.name)
            .join(Document, Document.id == DocumentChunk.document_id)
            .filter(Document.project_id == project_id)
            .limit(limit).all())
    return [{"content": c.content, "section": c.section, "source": name,
             "embedding": c.embedding} for c, name in rows]


def evidence(db: Session, project_id: str, query: str, k: int = 5) -> str:
    """Top-k excerpts joined for a prompt; empty string when nothing is indexed."""
    chunks = project_chunks(db, project_id)
    if not chunks:
        return ""
    return "\n".join(h.get("content", "")[:EXCERPT_CHARS]
                     for h in retrieve(chunks, query, k))
