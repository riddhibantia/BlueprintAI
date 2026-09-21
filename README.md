# DevBlueprint — AI-Powered Software Product Lifecycle & Engineering Blueprint Platform

Full spec: `Doc/DevBlueprint_Master_Project_Specification (1).md` (source of truth, §43).

## Quickstart (8GB-friendly, no Docker)

```powershell
# 1. Backend
python -m venv .venv; .\.venv\Scripts\Activate
pip install -r backend/requirements.txt
copy .env.example .env
python scripts/init_db.py
uvicorn app.main:app --reload --app-dir backend --port 8000
# health: http://localhost:8000/health

# 2. Frontend
cd frontend; npm install; npm run dev
# app: http://localhost:3000/dashboard
```

Default DB is SQLite (`devblueprint.db`) so it runs immediately.
For full Postgres+pgvector: run `scripts/install_postgres_windows.ps1` as Admin, create DB, set `DATABASE_URL` in `.env`.

## MVP flow

Create Project → Clarify → Generate Requirements → Approve → PRD → Stories → Architecture → DB/APIs/Security → Tasks → Tests → Traceability → Consistency → Impact → Export.

Deterministic metrics only — LLM never invents coverage (§30/§43).
