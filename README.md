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

## Verify (§44: the bar is "survives review", not "it runs")

```powershell
# Backend: unit + E2E + regression (expects 20+ green)
$env:DATABASE_URL="sqlite:///./e2e_test.db"; $env:PYTHONPATH="backend"
python -m pytest backend/tests -q

# Measured benchmark (temp DB, real numbers — see docs/EVALUATION.md)
$env:PYTHONPATH="backend"; python evaluation/benchmark.py --full

# Frontend production build
cd frontend; npm ci; npm run build
```

## Modules (§29.3 — all functional, no stubs)

Overview · Requirements · PRD · User Stories · Architecture · Database · APIs · Security · Tasks · Tests · Traceability · Consistency · Knowledge
