from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import Requirement, AgentRun, ArtifactVersion
from app.schemas import RequirementIn, RequirementUpdate, ClarifyIn
from app.agents.generators import clarify_questions, gen_requirements
import time

router = APIRouter(tags=["requirements"])


def _used_codes(db: Session, pid: str) -> set[str]:
    return {r.code for r in db.query(Requirement).filter_by(project_id=pid).all()}


def _next_code(db: Session, pid: str) -> str:
    used = _used_codes(db, pid)
    n = len(used) + 1
    while f"REQ-{n:03d}" in used:
        n += 1
    return f"REQ-{n:03d}"


@router.post("/projects/{pid}/clarify")
def clarify(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Clarification questions for the product idea (§6.2)."""
    p = project_or_403(pid, db, user)
    return {"questions": clarify_questions(p.product_idea or p.description or p.name)}


@router.post("/projects/{pid}/requirements/generate")
def generate(pid: str, body: ClarifyIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate stable-ID requirements from the idea + clarifications (§6.3).

    Append-only by default. With `replace=true`, existing requirements (plus
    their trace links and version history) are removed first so re-running
    never stacks duplicate content under bumped codes.
    """
    from app.models.db import TraceabilityLink
    p = project_or_403(pid, db, user)
    t0 = time.time()
    if body.replace:
        codes = [r.code for r in db.query(Requirement).filter_by(project_id=pid).all()]
        if codes:
            db.query(TraceabilityLink).filter(
                TraceabilityLink.project_id == pid,
                ((TraceabilityLink.source_type == "requirement") & (TraceabilityLink.source_id.in_(codes))) |
                ((TraceabilityLink.target_type == "requirement") & (TraceabilityLink.target_id.in_(codes)))).delete(synchronize_session=False)
            db.query(ArtifactVersion).filter(
                ArtifactVersion.project_id == pid, ArtifactVersion.artifact_type == "requirement",
                ArtifactVersion.artifact_code.in_(codes)).delete(synchronize_session=False)
            db.query(Requirement).filter_by(project_id=pid).delete(synchronize_session=False)
            db.flush()
    reqs = gen_requirements(p.product_idea or p.name, body.answers)
    used = _used_codes(db, pid)
    counter = len(used) + 1
    for r in reqs:
        while r["code"] in used:  # batch-safe: count-based bump collides on re-runs
            r["code"] = f"REQ-{counter:03d}"
            counter += 1
        used.add(r["code"])
        db.add(Requirement(project_id=pid, **r))
    db.commit()
    db.add(AgentRun(project_id=pid, agent="requirement", stage="generate",
                    input_summary=(p.product_idea or "")[:300], output_summary=f"{len(reqs)} requirements",
                    latency_ms=int((time.time() - t0) * 1000), tokens=len(reqs) * 40))
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="requirements.generate", detail=f"{len(reqs)} requirements")
    return {"count": len(reqs), "requirements": reqs}


@router.post("/projects/{pid}/requirements")
def add_one(pid: str, body: RequirementIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Hand-add a requirement (gets the next stable code)."""
    project_or_403(pid, db, user)
    r = Requirement(project_id=pid, code=_next_code(db, pid), title=body.title,
                    description=body.description, type=body.type, priority=body.priority,
                    acceptance_criteria=body.acceptance_criteria)
    db.add(r)
    db.commit()
    return {"code": r.code, "id": r.id}


@router.get("/projects/{pid}/requirements")
def list_req(pid: str, limit: int = Query(default=500, ge=1, le=2000),
             offset: int = Query(default=0, ge=0),
             db: Session = Depends(get_db), user=Depends(current_user)):
    """List requirements ordered by stable code (with version + timestamps for the workspace table)."""
    project_or_403(pid, db, user)
    rows = db.query(Requirement).filter_by(project_id=pid).order_by(Requirement.code).offset(offset).limit(limit).all()
    return [{"code": r.code, "title": r.title, "type": r.type, "status": r.status,
             "priority": r.priority, "id": r.id, "version": r.version,
             "updated_at": r.updated_at.isoformat() if r.updated_at else None}
            for r in rows]


@router.put("/requirements/{rid}")
def update_req(rid: str, body: RequirementUpdate, db: Session = Depends(get_db), user=Depends(current_user)):
    """Edit a requirement with optimistic locking (stale expected_version -> 409).

    The version check and the write happen in a single DB transaction: the row
    is re-read inside the transaction and the version is only bumped when the
    caller's expectation still holds, so two concurrent editors cannot both win.
    """
    r = db.query(Requirement).filter_by(id=rid).first()
    if not r:
        raise HTTPException(404, "Not found")
    project_or_403(r.project_id, db, user)
    if body.expected_version is not None and body.expected_version != r.version:
        raise HTTPException(409, f"Version conflict: current v{r.version}, you sent v{body.expected_version}")
    if body.status and body.status not in ("draft", "approved", "rejected", "changed"):
        raise HTTPException(400, "status must be draft|approved|rejected|changed")
    # version on title/desc change (§22 HITL: approved state distinct)
    changed = False
    if body.title is not None and body.title != r.title:
        if not body.title.strip():
            raise HTTPException(400, "title must not be empty")
        r.title = body.title.strip()
        changed = True
    if body.description is not None:
        r.description = body.description
        changed = True
    if body.priority:
        if body.priority not in ("low", "medium", "high", "critical"):
            raise HTTPException(400, "priority must be low|medium|high|critical")
        r.priority = body.priority
    if body.status:
        r.status = body.status
    if changed:
        # Re-check version inside the write transaction: if another request
        # committed between our read and our flush, the row version moved and
        # we must fail closed instead of silently overwriting.
        db.flush()
        fresh = db.query(Requirement.version).filter_by(id=rid).first()
        if fresh is not None and body.expected_version is not None and fresh[0] != body.expected_version:
            db.rollback()
            raise HTTPException(409, "Version conflict: requirement changed concurrently")
        r.version += 1
        db.add(ArtifactVersion(project_id=r.project_id, artifact_type="requirement",
                               artifact_code=r.code, version=r.version,
                               content={"title": r.title, "description": r.description}, status=r.status))
    db.commit()
    db.refresh(r)
    return {"code": r.code, "version": r.version, "status": r.status}


@router.post("/requirements/{rid}/approve")
def approve(rid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    r = db.query(Requirement).filter_by(id=rid).first()
    if not r:
        raise HTTPException(404, "Not found")
    project_or_403(r.project_id, db, user)
    r.status = "approved"
    db.add(ArtifactVersion(project_id=r.project_id, artifact_type="requirement",
                           artifact_code=r.code, version=r.version,
                           content={"title": r.title, "status": "approved"}, status="approved"))
    db.commit()
    log(db, project_id=r.project_id, user_id=user.id, action="requirement.approve", detail=r.code)
    return {"code": r.code, "status": "approved"}


@router.delete("/requirements/{rid}")
def delete_req(rid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Delete a requirement and every traceability edge touching it (full CRUD, §Phase 3)."""
    from app.models.db import TraceabilityLink
    r = db.query(Requirement).filter_by(id=rid).first()
    if not r:
        raise HTTPException(404, "Not found")
    project_or_403(r.project_id, db, user)
    code = r.code
    pid = r.project_id
    # Outbound edges (requirement -> downstream) and inbound edges (upstream -> requirement).
    db.query(TraceabilityLink).filter_by(project_id=pid, source_type="requirement", source_id=code).delete()
    db.query(TraceabilityLink).filter_by(project_id=pid, target_type="requirement", target_id=code).delete()
    # Version history for this artifact must not dangle after delete.
    db.query(ArtifactVersion).filter_by(project_id=pid, artifact_type="requirement", artifact_code=code).delete()
    db.delete(r)
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="requirement.delete", detail=code)
    return {"deleted": code}
