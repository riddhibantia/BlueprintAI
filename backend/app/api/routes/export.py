"""Export blueprint: Markdown / JSON / OpenAPI (§13 export)."""
from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import current_user, project_or_403
from app.models.db import Project, Requirement, UserStory, ApiEndpoint, TestCase, Prd
from app.traceability.engine import coverage

router = APIRouter(tags=["export"])


def _bundle(db: Session, pid: str) -> dict:
    p = db.query(Project).filter_by(id=pid).first()
    prd = db.query(Prd).filter_by(project_id=pid).first()
    return {
        "project": {"name": p.name, "idea": p.product_idea, "status": p.blueprint_status},
        "requirements": [{"code": r.code, "title": r.title, "type": r.type, "status": r.status} for r in db.query(Requirement).filter_by(project_id=pid).all()],
        "stories": [{"code": s.code, "story": s.story} for s in db.query(UserStory).filter_by(project_id=pid).all()],
        "apis": [{"method": a.method, "path": a.path, "auth": a.auth} for a in db.query(ApiEndpoint).filter_by(project_id=pid).all()],
        "tests": [{"code": t.code, "title": t.title} for t in db.query(TestCase).filter_by(project_id=pid).all()],
        "prd": (prd.content if prd else {}),
        "coverage": coverage(db, pid),
    }


@router.get("/projects/{pid}/export/json")
def export_json(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    return _bundle(db, pid)


@router.get("/projects/{pid}/export/markdown")
def export_md(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    b = _bundle(db, pid)
    lines = [f"# {b['project']['name']}", "", f"> {b['project']['idea']}", "",
             f"Coverage: {b['coverage']['coverage_pct']}%", "", "## Requirements"]
    lines += [f"- **{r['code']}** {r['title']} ({r['status']})" for r in b["requirements"]]
    lines += ["", "## APIs"] + [f"- `{a['method']} {a['path']}`" for a in b["apis"]]
    lines += ["", "## Tests"] + [f"- **{t['code']}** {t['title']}" for t in b["tests"]]
    return PlainTextResponse("\n".join(lines), media_type="text/markdown")


@router.get("/projects/{pid}/export/openapi")
def export_openapi(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    apis = db.query(ApiEndpoint).filter_by(project_id=pid).all()
    paths = {}
    for a in apis:
        paths.setdefault(a.path, {})[a.method.lower()] = {
            "summary": a.code, "security": [{"bearerAuth": []}] if a.auth == "jwt" else [],
            "responses": {"200": {"description": "OK"}}}
    return {"openapi": "3.0.0", "info": {"title": "DevBlueprint API", "version": "1.0.0"}, "paths": paths}
