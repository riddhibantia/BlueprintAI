from fastapi import APIRouter, Depends, HTTPException
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
    p = project_or_403(pid, db, user)
    return {"questions": clarify_questions(p.product_idea or p.description or p.name)}


@router.post("/projects/{pid}/requirements/generate")
def generate(pid: str, body: ClarifyIn, db: Session = Depends(get_db), user=Depends(current_user)):
    p = project_or_403(pid, db, user)
    t0 = time.time()
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
    project_or_403(pid, db, user)
    r = Requirement(project_id=pid, code=_next_code(db, pid), title=body.title,
                    description=body.description, type=body.type, priority=body.priority,
                    acceptance_criteria=body.acceptance_criteria)
    db.add(r)
    db.commit()
    return {"code": r.code, "id": r.id}


@router.get("/projects/{pid}/requirements")
def list_req(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    return [{"code": r.code, "title": r.title, "type": r.type, "status": r.status,
             "priority": r.priority, "id": r.id, "version": r.version}
            for r in db.query(Requirement).filter_by(project_id=pid).order_by(Requirement.code).all()]


@router.put("/requirements/{rid}")
def update_req(rid: str, body: RequirementUpdate, db: Session = Depends(get_db), user=Depends(current_user)):
    r = db.query(Requirement).filter_by(id=rid).first()
    if not r:
        raise HTTPException(404, "Not found")
    project_or_403(r.project_id, db, user)
    # version on title/desc change (§22 HITL: approved state distinct)
    changed = False
    if body.title and body.title != r.title:
        r.title = body.title
        changed = True
    if body.description is not None:
        r.description = body.description
        changed = True
    if body.priority:
        r.priority = body.priority
    if body.status:
        r.status = body.status
    if changed:
        r.version += 1
        db.add(ArtifactVersion(project_id=r.project_id, artifact_type="requirement",
                               artifact_code=r.code, version=r.version,
                               content={"title": r.title, "description": r.description}, status=r.status))
    db.commit()
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
