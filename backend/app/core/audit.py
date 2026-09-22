"""Audit trail (§34): who did what, when. Never stores secrets or document contents."""
from sqlalchemy.orm import Session
from app.models.db import AuditLog


def log(db: Session, *, project_id: str = "", user_id: str = "", action: str, detail: str = "") -> None:
    try:
        db.add(AuditLog(project_id=project_id, user_id=user_id, action=action, detail=(detail or "")[:500]))
        db.commit()
    except Exception:
        db.rollback()
