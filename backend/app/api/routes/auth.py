from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_token
from app.models.db import User
from app.schemas import RegisterIn, LoginIn

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter_by(email=body.email).first():
        raise HTTPException(400, "Email exists")
    u = User(email=body.email, password_hash=hash_password(body.password), name=body.name)
    db.add(u)
    db.commit()
    return {"token": create_token(u.id), "user": {"id": u.id, "email": u.email, "name": u.name}}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    u = db.query(User).filter_by(email=body.email).first()
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return {"token": create_token(u.id), "user": {"id": u.id, "email": u.email, "name": u.name}}
