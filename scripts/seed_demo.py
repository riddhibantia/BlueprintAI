"""Seed a fully populated demo workspace (mock LLM, no keys needed).

Builds, through the real API stack: user + project + idea-aware requirements
(approved) + full auto-pipeline + a knowledge doc + a consistency check — so a
fresh clone opens a workspace that already shows 100% traceability, issues to
triage, and a downloadable PDF.

Usage (from repo root):
    python scripts/seed_demo.py                       # sqlite default
    DATABASE_URL=postgresql+psycopg://... python scripts/seed_demo.py

Idempotent: existing demo user/project are reused; the artifact chain is only
built when the project has no requirements yet. Prints credentials + summary.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import init_db  # noqa: E402
from app.main import app  # noqa: E402

EMAIL = "demo@blueprint.ai"
PASSWORD = "demo12345"
IDEA = "Build an employee expense management platform."
WISHES = "Managers approve expenses by email. Receipts are required over $25."
DOC = ("# Expense engineering standards\n"
       "JWT required on all write endpoints.\n"
       "Receipts are mandatory for expenses over $25.\n"
       "Managers approve within 48 hours.\n")


def main() -> None:
    init_db()
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/auth/register", json={"email": EMAIL, "password": PASSWORD, "name": "Demo"})
        token = r.json().get("token") if r.status_code == 200 else None
        if token is None:  # already seeded -> log in
            r = c.post("/auth/login", json={"email": EMAIL, "password": PASSWORD})
            assert r.status_code == 200, f"login failed: {r.text[:120]}"
            token = r.json()["token"]
        h = {"Authorization": f"Bearer {token}"}

        mine = [p for p in c.get("/projects", headers=h).json()
                if p.get("name") == "Expense Platform Demo"]
        if mine:
            pid = mine[0]["id"]
            print(f"Demo project exists: {pid}")
        else:
            pid = c.post("/projects", headers=h,
                         json={"name": "Expense Platform Demo",
                               "description": "Seeded demo workspace — open it and click around.",
                               "product_idea": IDEA}).json()["id"]
            print(f"Demo project created: {pid}")

        reqs = c.get(f"/projects/{pid}/requirements", headers=h).json()
        if reqs:
            print(f"Artifacts already present ({len(reqs)} requirements) — chain skipped.")
        else:
            c.post(f"/projects/{pid}/requirements/generate",
                   json={"answers": WISHES}, headers=h)
            reqs = c.get(f"/projects/{pid}/requirements", headers=h).json()
            for q in reqs:
                c.post(f"/requirements/{q['id']}/approve", headers=h)
            c.post(f"/projects/{pid}/documents",
                   files={"file": ("standards.md", DOC)}, headers=h)
            pipe = c.post(f"/projects/{pid}/pipeline/run", headers=h).json()
            c.post(f"/projects/{pid}/consistency/check", headers=h)
            print(f"Chain built: {len(reqs)} approved, "
                  f"coverage {pipe.get('coverage_pct')}%.")

        metrics = c.get(f"/projects/{pid}", headers=h).json()["metrics"]
        print("Seeded demo workspace OK")
        print(f"  email:    {EMAIL}")
        print(f"  password: {PASSWORD}")
        print(f"  project:  {pid}")
        print(f"  metrics:  {metrics['requirements']} reqs, "
              f"{metrics['traceability_coverage']}% traced, "
              f"{metrics['consistency_open']} open issues")
        print("Next: run the API (uvicorn app.main:app --app-dir backend --port 8000)")
        print("      then the frontend (cd frontend; npm run dev) and log in.")


if __name__ == "__main__":
    main()
