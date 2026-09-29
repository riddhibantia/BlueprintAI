from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import (Project, ProjectMember, Requirement, UserStory, ApiEndpoint, TestCase,
                           ConsistencyIssue, AuditLog, AgentRun, User)
from app.schemas import ProjectIn
from app.traceability.engine import coverage

router = APIRouter(tags=["projects"])


@router.post("/projects")
def create_project(body: ProjectIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Create a project; the creator becomes owner (§6.1)."""
    p = Project(name=body.name, description=body.description, product_idea=body.product_idea, owner_id=user.id)
    db.add(p)
    db.commit()
    db.add(ProjectMember(project_id=p.id, user_id=user.id, role="owner"))
    db.commit()
    log(db, project_id=p.id, user_id=user.id, action="project.create", detail=p.name)
    return {"id": p.id, "name": p.name, "status": p.status}


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
    tested = db.query(TestCase.requirement_code).filter_by(project_id=pid).distinct().count()
    # Deterministic metrics only (§30)
    return {"id": p.id, "name": p.name, "description": p.description, "idea": p.product_idea,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
            "metrics": {"requirements": n_req, "traceability_coverage": cov["coverage_pct"],
                        "consistency_open": n_issue, "tests": n_test, "stories": n_story,
                        "apis": n_api, "test_coverage": round(100 * tested / max(1, n_req), 1),
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
    "consistency.check": "Validation completed",
    "consistency.decide": "Issue decision recorded",
    "impact.analyze": "Impact analyzed",
    "traceability.suggest": "Links suggested",
    "user.register": "Member joined",
    "user.login": "Signed in",
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
