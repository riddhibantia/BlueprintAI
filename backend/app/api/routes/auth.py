from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.core.config import settings
from app.core.security import hash_password, verify_password, create_token, decode_token
from app.api.deps import current_user
from app.models.db import User
from app.schemas import RegisterIn, LoginIn, ResetIn, ChangePasswordIn, RequestResetIn

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


@router.post("/request-reset")
def request_reset(body: RequestResetIn, db: Session = Depends(get_db)):
    """Mint a single-use reset token for the account, if it exists.

    Always answers identically so the endpoint cannot be used to enumerate
    accounts. The token is returned only outside production, where a mail
    provider would deliver it instead.
    """
    from app.core.security import create_reset_token
    email = body.email.strip().lower()
    u = db.query(User).filter_by(email=email).first()
    out: dict = {"status": "ok",
                 "message": "If that email is registered, reset instructions have been sent."}
    if u:
        token = create_reset_token(email)
        log(db, user_id=u.id, action="user.reset_requested", detail=email)
        if settings.ENV.lower() not in ("prod", "production"):
            # Dev convenience only: production must deliver this by mail, never
            # in the response body.
            out["reset_token"] = token
    return out


@router.post("/reset")
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    """Spend a single-use reset token to set a new password.

    A valid `reset_token` is required in every environment. There is no
    unauthenticated "just set it" path: that would let anyone with a victim's
    email address take over the account.
    """
    from app.core.security import verify_reset_token, reset_token_id
    from app.models.db import PasswordResetToken
    email = body.email.strip().lower()
    generic = {"status": "ok",
               "message": "If that email is registered, its password was reset — log in with the new one."}

    token = body.reset_token or ""
    if not token:
        raise HTTPException(401, "A reset token is required")

    # Bind the token to this email: a token minted for A cannot reset B.
    owner = verify_reset_token(token, email)
    if not owner:
        raise HTTPException(401, "Invalid or expired reset token")

    jti = reset_token_id(token)
    if not jti:
        raise HTTPException(401, "Invalid or expired reset token")
    if db.query(PasswordResetToken).filter_by(jti=jti).first():
        raise HTTPException(401, "This reset token has already been used")

    u = db.query(User).filter_by(email=email).first()
    if u:
        u.password_hash = hash_password(body.new_password)
        u.password_changed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        db.add(PasswordResetToken(jti=jti, email=email))
        db.commit()
        log(db, user_id=u.id, action="user.reset", detail=email)

    # Unknown email returns the same shape as success (no enumeration), but still
    # records the spend so the token cannot be replayed against a later account.
    if not u:
        try:
            db.add(PasswordResetToken(jti=jti, email=email))
            db.commit()
        except Exception:
            db.rollback()
    return generic


@router.post("/change-password")
def change_password(body: ChangePasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Authenticated password change."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    log(db, user_id=user.id, action="user.password_change")
    return {"status": "ok", "message": "Password changed successfully"}


@router.get("/me")
def me(user: User = Depends(current_user)):
    """Current session user (drives the frontend auth gate)."""
    return {"id": user.id, "email": user.email, "name": user.name}
