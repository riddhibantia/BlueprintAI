from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_token
from app.api.deps import current_user
from app.models.db import User
from app.schemas import RegisterIn, LoginIn

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE = "dbp_token"


def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(COOKIE, token,
                    max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                    httponly=True, samesite="lax", path="/",
                    secure=(settings.ENV == "prod"))


def _payload(u: User) -> dict:
    return {"token": create_token(u.id), "user": {"id": u.id, "email": u.email, "name": u.name}}


@router.post("/register")
def register(body: RegisterIn, resp: Response, db: Session = Depends(get_db)):
    """Create an account; session cookie is set on the response (httpOnly)."""
    email = body.email.strip().lower()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(400, "Email exists")
    u = User(email=email, password_hash=hash_password(body.password), name=body.name.strip())
    db.add(u)
    db.commit()
    log(db, user_id=u.id, action="user.register", detail=email)
    out = _payload(u)
    _set_cookie(resp, out["token"])
    return out


@router.post("/login")
def login(body: LoginIn, resp: Response, db: Session = Depends(get_db)):
    """Log in; session cookie is set on the response (httpOnly)."""
    email = body.email.strip().lower()
    u = db.query(User).filter_by(email=email).first()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    log(db, user_id=u.id, action="user.login")
    out = _payload(u)
    _set_cookie(resp, out["token"])
    return out


@router.post("/logout")
def logout(resp: Response, user: User = Depends(current_user)):
    """Clear the session cookie."""
    resp.delete_cookie(COOKIE, path="/")
    return {"status": "logged out"}


@router.get("/me")
def me(user: User = Depends(current_user)):
    """Current session user (drives the frontend auth gate)."""
    return {"id": user.id, "email": user.email, "name": user.name}
