import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import (Project, ProjectMember, Requirement, UserStory, ApiEndpoint, TestCase,
                           ConsistencyIssue, AuditLog, AgentRun, User)
from app.rag.standards_pack import seed_default_standards
from app.schemas import ProjectIn
from app.traceability.engine import coverage

router = APIRouter(tags=["projects"])
logger = logging.getLogger("blueprintai.projects")


@router.post("/projects")
def create_project(body: ProjectIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Create a project; the creator becomes owner (§6.1).

    The built-in standards pack is ingested immediately so RAG grounding works
    on the first page a user opens. Seeding is best-effort: a failure must not
    lose the project, and `POST /projects/{id}/documents/seed` retries it.
    """
    p = Project(name=body.name, description=body.description, product_idea=body.product_idea, owner_id=user.id)
    db.add(p)
    db.commit()
    db.add(ProjectMember(project_id=p.id, user_id=user.id, role="owner"))
    db.commit()
    log(db, project_id=p.id, user_id=user.id, action="project.create", detail=p.name)
    standards = 0
    try:
        standards = len(seed_default_standards(db, p.id)["seeded"])
    except Exception as exc:  # retrieval must never block project creation
        db.rollback()
        logger.warning("default standards seed failed for %s: %s", p.id, exc)
    return {"id": p.id, "name": p.name, "status": p.status, "standards": standards}


@router.get("/projects")
def list_projects(db: Session = Depends(get_db), user=Depends(current_user)):
    """Projects the user owns or is a member of."""
    owned = db.query(Project).filter_by(owner_id=user.id).all()
    member_ids = [m.project_id for m in db.query(ProjectMember).filter_by(user_id=user.id).all()]
    shared = db.query(Project).filter(Project.id.in_(member_ids)).all() if member_ids else []
    seen = {p.id: p for p in owned + shared}
    return [{"id": p.id, "name": p.name, "status": p.status, "idea": (p.product_idea or "")[:120]} for p in seen.values()]


@router.get("/projects/{pid}")
def get_project(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Project detail + deterministic health metrics (§30: computed, never LLM-invented)."""
    p = project_or_403(pid, db, user)
    cov = coverage(db, pid)
    n_req = db.query(Requirement).filter_by(project_id=pid).count()
    n_story = db.query(UserStory).filter_by(project_id=pid).count()
    n_api = db.query(ApiEndpoint).filter_by(project_id=pid).count()
    n_test = db.query(TestCase).filter_by(project_id=pid).count()
    n_issue = db.query(ConsistencyIssue).filter_by(project_id=pid, status="open").count()
    live_codes = {r.code for r in db.query(Requirement.code).filter_by(project_id=pid).all()}
    tested_codes = {c for (c,) in db.query(TestCase.requirement_code).filter_by(project_id=pid).distinct().all()}
    tested = len(tested_codes & live_codes)  # only currently-existing requirements count
    test_cov = round(100 * tested / max(1, n_req), 1) if n_req else (100.0 if not tested_codes else 0.0)
    test_cov = min(100.0, test_cov)  # a ratio, never above 100
    # Deterministic metrics only (§30)
    return {"id": p.id, "name": p.name, "description": p.description, "idea": p.product_idea,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "metrics": {"requirements": n_req, "traceability_coverage": cov["coverage_pct"],
                        "consistency_open": n_issue, "tests": n_test, "stories": n_story,
                        "apis": n_api, "test_coverage": test_cov,
                        "blueprint_status": p.blueprint_status}}


ACTION_LABELS = {
    "project.create": "Project created",
    "requirements.generate": "Requirements generated",
    "requirement.approve": "Requirement approved",
    "requirement.delete": "Requirement deleted",
    "prd.update": "PRD updated",
    "story.approve": "Story approved",
    "architecture.add": "Architecture updated",
    "architecture.delete": "Architecture updated",
    "knowledge.upload": "Document indexed",
    "knowledge.seed": "Standards pack installed",
    "pipeline.run": "Blueprint built",
    "consistency.check": "Validation completed",
    "consistency.decide": "Issue decision recorded",
    "impact.analyze": "Impact analyzed",
    "traceability.suggest": "Links suggested",
    "user.register": "Member joined",
    "user.login": "Signed in",
    "user.password_change": "Password changed",
}


@router.get("/projects/{pid}/activity")
def activity(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Recent activity from audit logs + agent runs (safe operational info only, §V2-12)."""
    project_or_403(pid, db, user)
    audits = db.query(AuditLog).filter_by(project_id=pid).order_by(AuditLog.created_at.desc()).limit(50).all()
    runs = db.query(AgentRun).filter_by(project_id=pid).order_by(AgentRun.created_at.desc()).limit(50).all()
    # Resolve actor emails with a scoped query — never load the whole users table.
    actor_ids = {a.user_id for a in audits if a.user_id}
    emails = dict(db.query(User.id, User.email).filter(User.id.in_(actor_ids)).all()) if actor_ids else {}
    events = []
    for a in audits:
        events.append({"kind": "audit", "action": a.action,
                       "label": ACTION_LABELS.get(a.action, a.action.replace(".", " ").replace("_", " ")),
                       "detail": a.detail or "", "actor": emails.get(a.user_id, ""),
                       "at": a.created_at.isoformat() if a.created_at else None})
    for r in runs:
        events.append({"kind": "agent", "action": f"agent.{r.agent}", "label": f"{r.agent.title()} agent completed",
                       "detail": r.output_summary or "", "actor": "",
                       "at": r.created_at.isoformat() if r.created_at else None})
    events.sort(key=lambda e: e["at"] or "", reverse=True)
    return {"events": events[:50]}


@router.patch("/projects/{pid}")
def update_project(pid: str, body: dict, db: Session = Depends(get_db), user=Depends(current_user)):
    """Update project name or description."""
    p = project_or_403(pid, db, user)
    if "name" in body and body["name"]:
        p.name = str(body["name"]).strip()[:120]
    if "description" in body:
        p.description = str(body["description"])[:4000]
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name, "description": p.description}


@router.delete("/projects/{pid}")
def delete_project(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Delete a project and all associated artifacts and history."""
    p = project_or_403(pid, db, user)
    membership = db.query(ProjectMember).filter_by(project_id=pid, user_id=user.id).first()
    if p.owner_id != user.id and (not membership or membership.role != "owner"):
        raise HTTPException(403, "Only the project owner can delete this project")

    from app.models.db import (
        AcceptanceCriteria, ArchitectureComponent, ArchitectureRelationship,
        DatabaseEntity, DatabaseField, SecurityRequirement, ImplementationTask,
        TraceabilityLink, ImpactRun, Document, DocumentChunk, Prd, ArtifactVersion
    )
    doc_ids = [d.id for d in db.query(Document.id).filter_by(project_id=pid).all()]
    if doc_ids:
        db.query(DocumentChunk).filter(DocumentChunk.document_id.in_(doc_ids)).delete(synchronize_session=False)
    db.query(Document).filter_by(project_id=pid).delete(synchronize_session=False)

    ent_ids = [e.id for e in db.query(DatabaseEntity.id).filter_by(project_id=pid).all()]
    if ent_ids:
        db.query(DatabaseField).filter(DatabaseField.entity_id.in_(ent_ids)).delete(synchronize_session=False)
    db.query(DatabaseEntity).filter_by(project_id=pid).delete(synchronize_session=False)

    story_ids = [s.id for s in db.query(UserStory.id).filter_by(project_id=pid).all()]
    if story_ids:
        db.query(AcceptanceCriteria).filter(AcceptanceCriteria.story_id.in_(story_ids)).delete(synchronize_session=False)

    db.query(UserStory).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(Requirement).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ArchitectureRelationship).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ArchitectureComponent).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ApiEndpoint).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(SecurityRequirement).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ImplementationTask).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(TestCase).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(TraceabilityLink).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ConsistencyIssue).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ImpactRun).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(AgentRun).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ArtifactVersion).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(Prd).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(AuditLog).filter_by(project_id=pid).delete(synchronize_session=False)
    db.query(ProjectMember).filter_by(project_id=pid).delete(synchronize_session=False)

    p_name = p.name
    db.delete(p)
    db.commit()
    log(db, project_id="", user_id=user.id, action="project.delete", detail=f"{p_name} ({pid})")
    return {"deleted": pid, "name": p_name}


@router.get("/projects/{pid}/versions")
def list_versions(pid: str, artifact_type: str = "", db: Session = Depends(get_db), user=Depends(current_user)):
    """List historical versions of project artifacts."""
    from app.models.db import ArtifactVersion
    project_or_403(pid, db, user)
    q = db.query(ArtifactVersion).filter_by(project_id=pid)
    if artifact_type:
        q = q.filter_by(artifact_type=artifact_type)
    rows = q.order_by(ArtifactVersion.version.desc()).limit(100).all()
    return [
        {
            "id": r.id,
            "artifact_type": r.artifact_type,
            "artifact_code": r.artifact_code,
            "version": r.version,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "content": r.content
        }
        for r in rows
    ]


@router.post("/projects/{pid}/versions/{vid}/rollback")
def rollback_version(pid: str, vid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Roll back an artifact to a previous version."""
    from app.models.db import ArtifactVersion, Prd, Requirement
    project_or_403(pid, db, user)
    v = db.query(ArtifactVersion).filter_by(id=vid, project_id=pid).first()
    if not v:
        raise HTTPException(404, "Artifact version not found")

    if v.artifact_type == "prd":
        prd = db.query(Prd).filter_by(project_id=pid).first()
        if prd:
            prd.content = v.content
            db.commit()
            log(db, project_id=pid, user_id=user.id, action="prd.rollback", detail=f"v{v.version}")
            return {"status": "rolled_back", "artifact_type": "prd", "version": v.version}
    elif v.artifact_type == "requirement" and v.artifact_code:
        req = db.query(Requirement).filter_by(project_id=pid, code=v.artifact_code).first()
        if req and isinstance(v.content, dict):
            req.title = v.content.get("title", req.title)
            req.description = v.content.get("description", req.description)
            req.priority = v.content.get("priority", req.priority)
            req.acceptance_criteria = v.content.get("acceptance_criteria", req.acceptance_criteria)
            req.version = (req.version or 1) + 1
            db.commit()
            log(db, project_id=pid, user_id=user.id, action="requirement.rollback", detail=f"{v.artifact_code} v{v.version}")
            return {"status": "rolled_back", "artifact_type": "requirement", "code": v.artifact_code, "version": v.version}

    return {"status": "noop", "message": f"Rollback for {v.artifact_type} recorded snapshot"}

