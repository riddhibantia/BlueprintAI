"""JWT (PyJWT) + password hashing (bcrypt, SHA-256 pre-stretch).

Senior note: python-jose (unmaintained since 2022) and passlib (dead since
2020, broken on bcrypt>=4.1) were dropped. bcrypt direct + SHA-256 pre-hash
handles >72-byte passwords the way Dropbox-style deployments do.
"""
import hashlib
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
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": sub, "exp": exp}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> str | None:
    """Subject or None — expired/forged tokens never raise."""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]).get("sub")
    except jwt.PyJWTError:
        return None
