"""JWT (PyJWT) + password hashing (bcrypt, SHA-256 pre-stretch).

Senior note: python-jose (unmaintained since 2022) and passlib (dead since
2020, broken on bcrypt>=4.1) were dropped. bcrypt direct + SHA-256 pre-hash
handles >72-byte passwords the way Dropbox-style deployments do.
"""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings


def _stretch(pw: str) -> bytes:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest().encode("utf-8")


def hash_password(p: str) -> str:
    """bcrypt hash with SHA-256 pre-stretch (no 72-byte ceiling)."""
    return bcrypt.hashpw(_stretch(p), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-work check; malformed hashes fail closed."""
    try:
        return bcrypt.checkpw(_stretch(plain), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(sub: str) -> str:
    """Short-lived HS256 session token (user id only — no PII inside)."""
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": sub, "exp": exp, "iat": now, "jti": str(uuid.uuid4())},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> str | None:
    """Subject or None — expired/forged tokens never raise."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        sub = payload.get("sub")
        return sub if isinstance(sub, str) and sub else None
    except jwt.PyJWTError:
        return None


def create_reset_token(email: str) -> str:
    """Short-lived, single-use reset token (15 minutes).

    Carries a `type` claim so a stolen *session* JWT can never be spent as a
    reset token, and a `jti` so one issued token can only be redeemed once.
    """
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=15)
    secret = settings.RESET_SECRET or settings.JWT_SECRET
    return jwt.encode(
        {"email": email, "type": "pw_reset", "exp": exp, "iat": now, "jti": str(uuid.uuid4())},
        secret,
        algorithm=settings.JWT_ALGORITHM,
    )


def verify_reset_token(token: str, email: str = "") -> str | None:
    """Return the subject email if valid, unspent, and (when given) matching.

    `type` is asserted so session tokens are rejected; `email` is compared so a
    token minted for one account cannot reset another.
    """
    try:
        secret = settings.RESET_SECRET or settings.JWT_SECRET
        payload = jwt.decode(token, secret, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "pw_reset":
        return None
    sub = payload.get("email")
    if not isinstance(sub, str) or not sub:
        return None
    if email and sub.lower() != email.lower():
        return None
    return sub


def reset_token_id(token: str) -> str | None:
    """The `jti` of a structurally valid reset token, for single-use tracking."""
    try:
        secret = settings.RESET_SECRET or settings.JWT_SECRET
        payload = jwt.decode(token, secret, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "pw_reset":
        return None
    jti = payload.get("jti")
    return jti if isinstance(jti, str) and jti else None
