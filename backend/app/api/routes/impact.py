from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import ImpactRun, Requirement
from app.impact.analyzer import analyze

router = APIRouter(tags=["impact"])


class ImpactIn(BaseModel):
    requirement_code: str = Field(min_length=1, max_length=64, pattern=r"^REQ-[0-9]{3,}$")


@router.post("/projects/{pid}/impact/analyze")
def run(pid: str, body: ImpactIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Deterministic dependency traversal + LLM explanation for a requirement change (§17)."""
    project_or_403(pid, db, user)
    if not db.query(Requirement).filter_by(project_id=pid, code=body.requirement_code).first():
        raise HTTPException(404, f"Unknown requirement {body.requirement_code}")
    res = analyze(db, pid, body.requirement_code)
    db.add(ImpactRun(project_id=pid, requirement_code=body.requirement_code,
                     affected=res["affected"], explanation=res["explanation"]))
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="impact.analyze",
        detail=f"{body.requirement_code} -> {len(res['affected'])} artifacts")
    return res
