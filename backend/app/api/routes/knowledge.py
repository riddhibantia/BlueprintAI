import hashlib
import io
import logging
import os
import time

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.core.config import settings
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import Document, DocumentChunk, AgentRun
from app.rag.ingest import ingest_text
from app.rag.context import project_chunks
from app.rag.retriever import retrieve
from app.rag.standards_pack import seed_default_standards

router = APIRouter(tags=["knowledge"])
ALLOWED_EXT = (".pdf", ".txt", ".md", ".docx")
MAX_BYTES = 15 * 1024 * 1024

logger = logging.getLogger("blueprintai.rag")


class QueryIn(BaseModel):
    query: str = Field(min_length=1, max_length=1000)
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
            raise HTTPException(
                400, "Could not read that PDF. If it is a scan, run OCR and upload the text."
            ) from exc
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
@router.post("/projects/{pid}/documents/upload")
async def upload(pid: str, file: UploadFile = File(...), db: Session = Depends(get_db),
                 user=Depends(current_user)):
    """Upload PDF/TXT/MD/DOCX knowledge document into project's RAG corpus."""
    project_or_403(pid, db, user)
    if not file.filename or not file.filename.lower().endswith(ALLOWED_EXT):
        raise HTTPException(400, f"Only {', '.join(ALLOWED_EXT)} supported")
    raw = await file.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "File exceeds the 15MB limit")
    text = _extract(file, raw)
    if not text.strip():
        raise HTTPException(400, "No extractable text in that file (is it a scanned image?).")
    checksum = hashlib.sha256(raw).hexdigest()
    result = ingest_text(db, pid, name=file.filename or "upload", text=text,
                         checksum=checksum)
    if result["status"] == "duplicate":
        return {"status": "duplicate", "checksum": checksum}
    if settings.STORAGE_MODE == "local":
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        with open(os.path.join(settings.UPLOAD_DIR, f"{result['document_id']}.txt"),
                  "w", encoding="utf-8") as f:
            f.write(text[:200000])
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="knowledge.upload",
        detail=f"{file.filename or 'upload'} ({result['chunks']} chunks)")
    return {"document_id": result["document_id"], "chunks": result["chunks"],
            "checksum": checksum}


@router.post("/projects/{pid}/documents/seed")
def seed_standards(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Install the built-in standards pack; idempotent, safe to retry (§18)."""
    project_or_403(pid, db, user)
    result = seed_default_standards(db, pid)
    log(db, project_id=pid, user_id=user.id, action="knowledge.seed",
        detail=f"{len(result['seeded'])} seeded, {len(result['skipped'])} skipped")
    return {"seeded": len(result["seeded"]), "skipped": len(result["skipped"]),
            "documents": result["seeded"] + result["skipped"]}


@router.post("/projects/{pid}/knowledge/query")
def query(pid: str, body: QueryIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Hybrid retrieval: semantic dense vector + BM25 keyword matching."""
    project_or_403(pid, db, user)
    chunks = project_chunks(db, pid)
    hits = retrieve(chunks, body.query, k=body.k)
    return {"hits": hits, "count": len(hits)}


@router.get("/projects/{pid}/knowledge/stats")
def knowledge_stats(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Summary of ingested knowledge base for a project."""
    project_or_403(pid, db, user)
    docs = db.query(Document).filter_by(project_id=pid).all()
    doc_ids = [d.id for d in docs]
    total_chunks = (
        db.query(DocumentChunk).filter(DocumentChunk.document_id.in_(doc_ids)).count() if doc_ids else 0
    )
    return {
        "documents": len(docs),
        "document_count": len(docs),
        "total_chunks": total_chunks,
        "chunk_count": total_chunks,
        "embedding_provider": getattr(settings, "EMBEDDING_PROVIDER", "hash"),
        "vector_db": "sqlite-dense-index",
    }


@router.get("/projects/{pid}/documents")
def list_docs(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Indexed documents with chunk counts (ingestion status, §35)."""
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
    return [
        {
            "id": d.id,
            "name": d.name,
            "chunks": counts.get(d.id, 0),
            "checksum": d.checksum[:10],
            "source": getattr(d, "source", "upload"),
        }
        for d in docs
    ]


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
