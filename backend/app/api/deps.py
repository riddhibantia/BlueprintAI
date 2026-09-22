"""Shared dependencies: DB + auth + project access (§34)."""
from fastapi import Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models.db import User, Project, ProjectMember


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    token = authorization[7:] if authorization.startswith("Bearer ") else authorization
    sub = decode_token(token) if token else None
    if not sub:
        raise HTTPException(401, "Unauthorized")
    u = db.query(User).filter_by(id=sub).first()
    if not u:
        raise HTTPException(401, "User not found")
    return u


def project_or_403(project_id: str, db: Session, user: User) -> Project:
    p = db.query(Project).filter_by(id=project_id).first()
    if not p:
        raise HTTPException(404, "Project not found")
    if p.owner_id == user.id:
        return p
    m = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user.id).first()
    if not m:
        raise HTTPException(403, "No access to project")
    return p
