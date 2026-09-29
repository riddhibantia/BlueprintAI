"""Audit trail (§34): who did what, when. Never stores secrets or document contents."""
import logging
import sys

from sqlalchemy.orm import Session
from app.models.db import AuditLog

_logger = logging.getLogger("devblueprint.audit")


def _redact(detail: str) -> str:
    low = detail.lower()
    if "secret" in low or "prompt" in low or "password" in low or "token" in low:
        return "[redacted]"
    return detail


def log(db: Session, *, project_id: str = "", user_id: str = "", action: str, detail: str = "") -> None:
    """Persist one audit row. Callers must have committed their own writes first.

    The helper owns only the audit INSERT: on failure it rolls back to the last
    savepoint-safe state and reports to stderr instead of silently swallowing,
    so a logging failure can never wipe the caller's pending work unnoticed.
    """
    try:
        db.add(AuditLog(project_id=project_id, user_id=user_id, action=action,
                        detail=_redact(detail or "")[:500]))
        db.commit()
    except Exception as exc:  # audit must never break the request
        try:
            db.rollback()
        finally:
            print(f"audit.log failed action={action}: {exc}", file=sys.stderr)
            _logger.warning("audit.log failed action=%s: %s", action, exc)
