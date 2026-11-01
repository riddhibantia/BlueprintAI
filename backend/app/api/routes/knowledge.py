"""RAG: upload (PDF/TXT/MD/DOCX) -> chunk -> embed -> store; query -> hybrid retrieval (§18)."""
import hashlib
import io
import logging
import os
import time
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import Document, DocumentChunk, AgentRun
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed, embed_batch, get_embedding_info
from app.rag.retriever import retrieve

router = APIRouter(tags=["knowledge"])
ALLOWED_EXT = (".pdf", ".txt", ".md", ".docx")
MAX_BYTES = 15 * 1024 * 1024
MAX_CHUNKS_STORED = 300

logger = logging.getLogger("devblueprint.rag")


class QueryIn(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    k: int = Field(default=5, ge=1, le=20)


def _extract(upload: UploadFile, raw: bytes) -> str:
    name = (upload.filename or "").lower()
    if name.endswith(".pdf"):
        try:
            import fitz
            doc = fitz.open(stream=raw, filetype="pdf")
            return "\n".join(page.get_text() for page in doc)
        except Exception as exc:
            logger.warning("pdf parse failed for %s: %s", upload.filename, type(exc).__name__)
            raise HTTPException(400, f"Failed to extract readable text from PDF: {upload.filename}")
    if name.endswith(".docx"):
        try:
            import docx
            doc = docx.Document(io.BytesIO(raw))
            paras = [p.text for p in doc.paragraphs if p.text.strip()]
            for table in doc.tables:
                for row in table.rows:
                    cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if cells:
                        paras.append(" | ".join(cells))
            return "\n\n".join(paras)
        except Exception as exc:
            logger.warning("docx parse failed for %s: %s", upload.filename, type(exc).__name__)
            raise HTTPException(400, f"Failed to extract readable text from Word document: {upload.filename}")
    return raw.decode("utf-8", errors="ignore")


@router.post("/projects/{pid}/documents")
async def upload(pid: str, file: UploadFile = File(...),
                 db: Session = Depends(get_db), user=Depends(current_user)):
    """Ingest a standard (PDF/TXT/MD/DOCX): parse -> chunk -> embed -> store (§18)."""
    t0 = time.time()
    project_or_403(pid, db, user)
    name = (file.filename or "upload").lower()
    if not name.endswith(ALLOWED_EXT):
        raise HTTPException(400, f"Only PDF, TXT, Markdown, or Word documents are accepted (got {file.filename})")
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "File exceeds the 15MB limit")
    text = _extract(file, raw)
    checksum = hashlib.sha256(raw).hexdigest()
    if db.query(Document).filter_by(project_id=pid, checksum=checksum).first():
        return {"status": "duplicate", "checksum": checksum}
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    doc = Document(project_id=pid, name=file.filename or "upload", checksum=checksum)
    db.add(doc)
    db.flush()

    chunks = chunk_text(text)
    if settings.STORAGE_MODE == "local":
        with open(os.path.join(settings.UPLOAD_DIR, f"{doc.id}.txt"), "w", encoding="utf-8") as f:
            f.write(text[:200000])

    selected_chunks = chunks[:MAX_CHUNKS_STORED]
    # Compute embeddings in batch for high performance and minimum API latency
    chunk_texts = [c["content"][:1000] for c in selected_chunks]
    vectors = embed_batch(chunk_texts)

    for i, (c, vec) in enumerate(zip(selected_chunks, vectors)):
        word_count = len(c["content"].split())
        db.add(DocumentChunk(
            document_id=doc.id,
            page_number=i // 3,
            section=c["section"][:200],
            content=c["content"][:4000],
            meta={"source": doc.name, "word_count": word_count, "char_count": len(c["content"])},
            embedding=vec,
        ))

    emb_info = get_embedding_info()
    latency_ms = int((time.time() - t0) * 1000)
    db.add(AgentRun(
        project_id=pid,
        agent="rag-ingest",
        output_summary=f"{len(selected_chunks)} chunks embedded from {doc.name} via {emb_info['provider']} ({latency_ms}ms)",
        latency_ms=latency_ms,
    ))
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="knowledge.upload", detail=f"{doc.name} ({len(selected_chunks)} chunks)")
    return {
        "document_id": doc.id,
        "chunks": len(selected_chunks),
        "checksum": checksum,
        "embedding_provider": emb_info["provider"],
        "latency_ms": latency_ms,
    }


@router.post("/projects/{pid}/knowledge/query")
def query(pid: str, body: QueryIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Hybrid retrieval over project-scoped chunks; says so when evidence is missing."""
    project_or_403(pid, db, user)
    rows = db.query(DocumentChunk, Document.name).join(Document, Document.id == DocumentChunk.document_id)\
        .filter(Document.project_id == pid).limit(300).all()
    chunks = [{"content": c.content, "section": c.section, "source": name,
               "embedding": c.embedding} for c, name in rows]
    if not chunks:
        return {"hits": [], "note": "insufficient evidence — upload engineering docs first (§43.20)"}
    return {"hits": retrieve(chunks, body.query, body.k)}


@router.get("/projects/{pid}/knowledge/stats")
def knowledge_stats(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Summary of vector database, active embedding provider, and indexed corpus."""
    from sqlalchemy import func
    project_or_403(pid, db, user)
    docs = db.query(Document).filter_by(project_id=pid).all()
    doc_ids = [d.id for d in docs]
    n_chunks = db.query(func.count(DocumentChunk.id)).filter(DocumentChunk.document_id.in_(doc_ids)).scalar() or 0 if doc_ids else 0
    emb_info = get_embedding_info()

    return {
        "document_count": len(docs),
        "chunk_count": n_chunks,
        "embedding_provider": emb_info["provider"],
        "embedding_model": emb_info["model"],
        "embedding_dim": emb_info["dim"],
        "vector_db": "pgvector" if settings.is_postgres else "sqlite_memory_vector",
        "storage_mode": settings.STORAGE_MODE,
    }


@router.get("/projects/{pid}/documents")
def list_docs(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Indexed documents with chunk counts (ingestion status, §35)."""
    from sqlalchemy import func
    project_or_403(pid, db, user)
    docs = db.query(Document).filter_by(project_id=pid).all()
    if not docs:
        return []
    counts = dict(
        db.query(DocumentChunk.document_id, func.count(DocumentChunk.id))
        .filter(DocumentChunk.document_id.in_([d.id for d in docs]))
        .group_by(DocumentChunk.document_id)
        .all()
    )
    return [{"id": d.id, "name": d.name, "chunks": counts.get(d.id, 0), "checksum": d.checksum[:10]} for d in docs]


@router.delete("/projects/{pid}/documents/{did}")
def delete_doc(pid: str, did: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Delete a document and its chunks from the knowledge base."""
    project_or_403(pid, db, user)
    doc = db.query(Document).filter_by(id=did, project_id=pid).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    name = doc.name
    db.query(DocumentChunk).filter_by(document_id=did).delete(synchronize_session=False)
    db.delete(doc)
    db.commit()
    file_path = os.path.join(settings.UPLOAD_DIR, f"{did}.txt")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass
    log(db, project_id=pid, user_id=user.id, action="knowledge.delete", detail=name)
    return {"status": "deleted", "id": did, "name": name}
