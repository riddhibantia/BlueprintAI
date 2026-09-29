"""Seed a demo workspace: user + project + full artifact chain (mock LLM, no keys needed).

Usage (from repo root):
    python scripts/seed_demo.py                       # sqlite default
    DATABASE_URL=postgresql+psycopg://... python scripts/seed_demo.py

Prints credentials + project id + next steps. Idempotent per email (skips
existing demo user).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.core.database import SessionLocal, init_db  # noqa: E402
from app.models.db import User, Project, ProjectMember  # noqa: E402
from app.core.security import hash_password  # noqa: E402

EMAIL = "demo@blueprint.ai"
PASSWORD = "demo12345"
IDEA = "Build an employee expense management platform."


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=EMAIL).first()
        if user:
            print(f"Demo user exists: {EMAIL} (skip)")
            return
        user = User(email=EMAIL, password_hash=hash_password(PASSWORD), name="Demo")
        db.add(user)
        db.commit()
        project = Project(name="Expense Platform Demo", description="Seeded demo workspace",
                          product_idea=IDEA, owner_id=user.id)
        db.add(project)
        db.commit()
        db.add(ProjectMember(project_id=project.id, user_id=user.id, role="owner"))
        db.commit()
        print("Seeded demo workspace OK")
        print(f"  email:    {EMAIL}")
        print(f"  password: {PASSWORD}")
        print(f"  project:  {project.id}")
        print("Next: run the API (uvicorn app.main:app --app-dir backend --port 8000)")
        print("      then the frontend (cd frontend; npm run dev) and log in.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
