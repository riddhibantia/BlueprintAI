"""Document ingestion: parse -> chunk -> embed -> store.

Shared by the upload endpoint and the built-in standards pack so both paths
produce identical chunks, embeddings and provenance rows. The caller owns the
transaction boundary and commits.
"""
import hashlib
import logging

from sqlalchemy.orm import Session

from app.models.db import AgentRun, Document, DocumentChunk
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed

MAX_CHUNKS_STORED = 300

logger = logging.getLogger("blueprintai.rag")


def checksum_of(text: str) -> str:
    """Stable content hash: same text never indexes twice in one project."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def ingest_text(db: Session, project_id: str, *, name: str, text: str,
                source: str = "upload", checksum: str | None = None,
                agent: str = "rag-ingest") -> dict:
    """Store one document and its chunks; idempotent on (project, checksum)."""
    text = (text or "").strip()
    if not text:
        raise ValueError("document is empty")
    checksum = checksum or checksum_of(text)
    existing = db.query(Document).filter_by(project_id=project_id,
                                            checksum=checksum).first()
    if existing:
        return {"status": "duplicate", "document_id": existing.id,
                "chunks": 0, "checksum": checksum}

    doc = Document(project_id=project_id, name=name, checksum=checksum,
                   source=source)
    db.add(doc)
    db.flush()

    chunks = chunk_text(text)
    stored = chunks[:MAX_CHUNKS_STORED]
    for i, c in enumerate(stored):
        db.add(DocumentChunk(
            document_id=doc.id,
            page_number=i // 3,
            section=c["section"][:200],
            content=c["content"][:4000],
            meta={"source": name},
            embedding=embed(c["content"][:1000]),
        ))
    if len(chunks) > MAX_CHUNKS_STORED:
        logger.warning("document %s truncated to %d of %d chunks",
                       name, MAX_CHUNKS_STORED, len(chunks))
    db.add(AgentRun(project_id=project_id, agent=agent,
                    output_summary=f"{len(stored)} chunks from {name}"))
    return {"status": "ingested", "document_id": doc.id,
            "chunks": len(stored), "checksum": checksum}
