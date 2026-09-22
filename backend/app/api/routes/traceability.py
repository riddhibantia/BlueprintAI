from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.traceability.engine import coverage, forward, backward, suggest, add_link
from app.models.db import TraceabilityLink

router = APIRouter(tags=["traceability"])


class LinkIn(BaseModel):
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    relationship_type: str = "implements"


@router.post("/projects/{pid}/traceability/links")
def add(pid: str, body: LinkIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Confirm a traceability link (manual or from suggestions)."""
    project_or_403(pid, db, user)
    l = add_link(db, pid, body.source_type, body.source_id, body.target_type, body.target_id, body.relationship_type)
    return {"id": l.id}


@router.get("/projects/{pid}/traceability")
def get_all(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Full link set + coverage (forward/backward/orphans)."""
    project_or_403(pid, db, user)
    links = db.query(TraceabilityLink).filter_by(project_id=pid).all()
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
