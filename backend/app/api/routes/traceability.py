from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.traceability.engine import coverage, forward, backward, suggest, add_link
from app.models.db import TraceabilityLink

router = APIRouter(tags=["traceability"])

NODE_TYPES = ("requirement", "story", "api", "db", "security", "task", "test")


class LinkIn(BaseModel):
    source_type: str = Field(min_length=1, max_length=32, pattern="^(requirement|story|api|db|security|task|test)$")
    source_id: str = Field(min_length=1, max_length=64)
    target_type: str = Field(min_length=1, max_length=32, pattern="^(requirement|story|api|db|security|task|test)$")
    target_id: str = Field(min_length=1, max_length=64)
    relationship_type: str = Field(default="implements", min_length=1, max_length=32,
                                   pattern="^(implements|protects|validated-by|tests|documents)$")


@router.post("/projects/{pid}/traceability/links")
def add(pid: str, body: LinkIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Confirm a traceability link (manual or from suggestions)."""
    project_or_403(pid, db, user)
    l = add_link(db, pid, body.source_type, body.source_id, body.target_type, body.target_id, body.relationship_type)
    return {"id": l.id}


@router.get("/projects/{pid}/traceability")
def get_all(pid: str, limit: int = Query(default=500, ge=1, le=2000),
            offset: int = Query(default=0, ge=0),
            db: Session = Depends(get_db), user=Depends(current_user)):
    """Full link set + coverage (forward/backward/orphans). Paginated via limit/offset."""
    project_or_403(pid, db, user)
    links = db.query(TraceabilityLink).filter_by(project_id=pid).offset(offset).limit(limit).all()
    return {"coverage": coverage(db, pid),
            "links": [{"from": f"{l.source_type}:{l.source_id}", "to": f"{l.target_type}:{l.target_id}", "rel": l.relationship_type} for l in links]}


@router.get("/projects/{pid}/traceability/{code}")
def trace_one(pid: str, code: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Forward trace from a requirement + everything pointing at the code (backward)."""
    project_or_403(pid, db, user)
    return {"requirement": code, "forward": forward(db, pid, code),
            "backward": backward(db, pid, code), "coverage": coverage(db, pid)}


@router.post("/projects/{pid}/traceability/suggest")
def suggest_links(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Deterministic link suggestions (traceability agent). The user confirms each one."""
    project_or_403(pid, db, user)
    out = suggest(db, pid)
    log(db, project_id=pid, user_id=user.id, action="traceability.suggest", detail=f"{len(out)} suggestions")
    return {"suggestions": out}
