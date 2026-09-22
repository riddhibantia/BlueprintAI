"""RAG: upload (PDF/text) -> chunk -> embed -> store; query -> hybrid retrieval (§18)."""
import hashlib, os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import Document, DocumentChunk, AgentRun
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed
from app.rag.retriever import retrieve

router = APIRouter(tags=["knowledge"])
ALLOWED_EXT = (".pdf", ".txt", ".md")


class QueryIn(BaseModel):
    query: str
    k: int = 5


def _extract(upload: UploadFile, raw: bytes) -> str:
    name = (upload.filename or "").lower()
    if name.endswith(".pdf"):
        try:
            import fitz
            doc = fitz.open(stream=raw, filetype="pdf")
            return "\n".join(page.get_text() for page in doc)
        except Exception as e:
            return f"[pdf-parse-failed: {e}]"
    return raw.decode("utf-8", errors="ignore")


@router.post("/projects/{pid}/documents")
async def upload(pid: str, file: UploadFile = File(...),
                 db: Session = Depends(get_db), user=Depends(current_user)):
    """Ingest a standard (PDF/TXT/MD): parse -> chunk -> embed -> store (§18)."""
    project_or_403(pid, db, user)
    name = (file.filename or "upload").lower()
    if not name.endswith(ALLOWED_EXT):
        raise HTTPException(400, f"Only PDF, TXT, or Markdown files are accepted (got {file.filename})")
    raw = await file.read()
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(400, "File > 15MB")
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
    for i, c in enumerate(chunks[:300]):
        db.add(DocumentChunk(document_id=doc.id, page_number=i // 3, section=c["section"][:200],
                             content=c["content"][:4000], meta={"source": doc.name}, embedding=embed(c["content"][:1000])))
    db.add(AgentRun(project_id=pid, agent="rag-ingest", output_summary=f"{len(chunks)} chunks from {doc.name}"))
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="knowledge.upload", detail=f"{doc.name} ({len(chunks)} chunks)")
    return {"document_id": doc.id, "chunks": len(chunks), "checksum": checksum}


@router.post("/projects/{pid}/knowledge/query")
def query(pid: str, body: QueryIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Hybrid retrieval over project-scoped chunks; says so when evidence is missing."""
    project_or_403(pid, db, user)
    rows = db.query(DocumentChunk, Document.name).join(Document, Document.id == DocumentChunk.document_id)\
        .filter(Document.project_id == pid).limit(300).all()
    chunks = [{"content": c.content, "section": c.section, "source": name} for c, name in rows]
    if not chunks:
        return {"hits": [], "note": "insufficient evidence — upload engineering docs first (§43.20)"}
    return {"hits": retrieve(chunks, body.query, body.k)}


@router.get("/projects/{pid}/documents")
def list_docs(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Indexed documents with chunk counts (ingestion status, §35)."""
    project_or_403(pid, db, user)
    docs = db.query(Document).filter_by(project_id=pid).all()
    out = []
    for d in docs:
        n = db.query(DocumentChunk).filter_by(document_id=d.id).count()
        out.append({"id": d.id, "name": d.name, "chunks": n, "checksum": d.checksum[:10]})
    return out
