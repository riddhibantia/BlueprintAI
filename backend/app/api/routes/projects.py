from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import Project, ProjectMember, Requirement, UserStory, ApiEndpoint, TestCase, ConsistencyIssue
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
    tested = len({t.requirement_code for t in db.query(TestCase).filter_by(project_id=pid).all()})
    # Deterministic metrics only (§30)
    return {"id": p.id, "name": p.name, "description": p.description, "idea": p.product_idea,
            "metrics": {"requirements": n_req, "traceability_coverage": cov["coverage_pct"],
                        "consistency_open": n_issue, "tests": n_test, "stories": n_story,
                        "apis": n_api, "test_coverage": round(100 * tested / max(1, n_req), 1),
                        "blueprint_status": p.blueprint_status}}
