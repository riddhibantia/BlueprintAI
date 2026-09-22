from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import ImpactRun
from app.impact.analyzer import analyze

router = APIRouter(tags=["impact"])


class ImpactIn(BaseModel):
    requirement_code: str


@router.post("/projects/{pid}/impact/analyze")
def run(pid: str, body: ImpactIn, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    res = analyze(db, pid, body.requirement_code)
    db.add(ImpactRun(project_id=pid, requirement_code=body.requirement_code,
                     affected=res["affected"], explanation=res["explanation"]))
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="impact.analyze",
        detail=f"{body.requirement_code} -> {len(res['affected'])} artifacts")
    return res
