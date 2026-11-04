from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_token, decode_token
from app.api.deps import current_user
from app.models.db import User
from app.schemas import RegisterIn, LoginIn, ResetIn, ChangePasswordIn, RequestResetIn, PasswordChangeIn

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE = "dbp_token"


def _set_cookie(resp: Response, token: str) -> None:
    samesite = settings.COOKIE_SAMESITE
    resp.set_cookie(COOKIE, token,
                    max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
                    httponly=True, samesite=samesite, path="/",
                    # SameSite=None is rejected by browsers without Secure.
                    secure=(settings.ENV == "prod" or samesite == "none"))


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


@router.post("/change-password")
def change_password_compat(body: ChangePasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Authenticated password change."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    log(db, user_id=user.id, action="user.password_change")
    return {"status": "ok", "message": "Password changed successfully"}


@router.post("/password")
def change_password(body: PasswordChangeIn, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    """Change the signed-in user's password."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    log(db, user_id=user.id, action="user.password_change")
    return {"status": "ok", "message": "Password updated. Use it the next time you log in."}


@router.post("/request-reset")
def request_reset(body: RequestResetIn, db: Session = Depends(get_db)):
    """Request an out-of-band password reset token sent via email.
    
    Always responds with a generic confirmation to prevent user enumeration.
    In non-production environments, provides dev_token for automated testing.
    """
    from app.core.security import create_reset_token
    from app.core.email import send_password_reset_email

    email = body.email.strip().lower()
    u = db.query(User).filter_by(email=email).first()
    dev_token = None
    if u:
        token = create_reset_token(email)
        send_password_reset_email(email, token)
        log(db, user_id=u.id, action="user.reset_requested")
        if settings.ENV != "prod":
            dev_token = token

    resp = {
        "status": "ok",
        "message": "If this email is registered, password reset instructions have been sent."
    }
    if dev_token:
        resp["dev_token"] = dev_token
    return resp


@router.post("/reset-password")
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    """Redeem a single-use out-of-band reset token to set a new password."""
    from app.core.security import verify_reset_token, reset_token_id
    from app.models.db import PasswordResetToken

    token = (body.reset_token or "").strip()
    if not token:
        raise HTTPException(400, "Reset token is required")

    email = body.email.strip().lower()
    sub = verify_reset_token(token, email)
    if not sub:
        raise HTTPException(400, "Invalid or expired reset token")

    jti = reset_token_id(token)
    if not jti:
        raise HTTPException(400, "Malformed reset token")

    # Enforce single-use token ledger
    spent = db.query(PasswordResetToken).filter_by(jti=jti).first()
    if spent:
        raise HTTPException(400, "Reset token has already been used")

    u = db.query(User).filter_by(email=email).first()
    if not u:
        raise HTTPException(404, "User not found")

    u.password_hash = hash_password(body.new_password)
    u.password_changed_at = datetime.now(timezone.utc)
    db.add(PasswordResetToken(jti=jti, email=email))
    db.commit()
    log(db, user_id=u.id, action="user.password_reset")
    return {"status": "ok", "message": "Password reset successful. Please log in with your new password."}


@router.get("/me")
def me(user: User = Depends(current_user)):
    """Current session user (drives the frontend auth gate)."""
    return {"id": user.id, "email": user.email, "name": user.name}
