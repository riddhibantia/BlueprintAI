from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import ConsistencyIssue, AgentRun
from app.consistency.rules import run_checks
from app.agents.base import complete

router = APIRouter(tags=["consistency"])


@router.post("/projects/{pid}/consistency/check")
def check(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    found = run_checks(db, pid)
    db.query(ConsistencyIssue).filter_by(project_id=pid, status="open").delete()
    for i in found:
        expl = complete(f"Explain: {i['description']}. Suggest fix.")
        db.add(ConsistencyIssue(project_id=pid, check=i["check"], severity=i["severity"],
                                description=i["description"] + f" | AI: {expl['text'][:200]}",
                                affected=i["affected"], suggestion=i["suggestion"]))
    db.add(AgentRun(project_id=pid, agent="consistency", output_summary=f"{len(found)} issues"))
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="consistency.check", detail=f"{len(found)} issues")
    return {"count": len(found), "issues": found}


@router.get("/projects/{pid}/consistency/issues")
def issues(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    rows = db.query(ConsistencyIssue).filter_by(project_id=pid).all()
    return [{"id": r.id, "check": r.check, "severity": r.severity, "description": r.description,
             "affected": r.affected, "suggestion": r.suggestion, "status": r.status} for r in rows]
