# BlueprintAI — AI-Powered SDLC & Engineering Blueprint Platform

![CI](https://github.com/riddhibantia/BlueprintAI/actions/workflows/ci.yml/badge.svg)
![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

> Idea → PRD → user stories → architecture → DB/APIs/security → tasks → tests, with RAG-grounded generation, traceability, consistency checks, impact analysis, and PDF export. Deterministic metrics only — the LLM never invents coverage.

Full spec: `docs/SPEC.md`. Security: `docs/SECURITY.md`. Measured numbers: `docs/EVALUATION.md`.

## Features

| Area | What works |
|---|---|
| 13 artifact modules | Requirements, PRD, Stories, Architecture, Database, APIs, Security, Tasks, Tests, Traceability, Consistency, Impact, Knowledge — no stubs |
| RAG-grounded generation | Upload PDF/TXT/MD → chunk → hash/OpenAI embeddings → pgvector; every generation cites evidence |
| Multi-agent pipeline | LangGraph workflow with sequential fallback (reported in benchmark output) |
| Collaboration safety | httpOnly `SameSite=Lax` sessions, `project_or_403` isolation, optimistic locking (409), audit logs |
| Export | PRD/architecture PDF (ReportLab), Archify diagram IR (1:1 topology) |
| Quality gates | 35 pytest tests green, `evaluation/benchmark.py --full` measures latency/coverage, `npm run build` clean |

## Tech stack

| Layer | Tech |
|---|---|
| Backend | FastAPI 0.141, Uvicorn, SQLAlchemy 2.0, Pydantic v2, PyJWT + bcrypt, PyMuPDF, ReportLab |
| AI / RAG | langchain-core, LangGraph, OpenAI (mock by default), pgvector + hash-embedding fallback |
| DB | Postgres + pgvector (prod) / SQLite fallback (local) |
| Frontend | Next.js 16.3.5, React 19.3, Tailwind 4.3, @xyflow/react (diagrams), lucide-react, TypeScript |
| Infra | GitHub Actions CI (pytest + `npm run build`), `scripts/init_db.py` |

## Architecture

```
Next.js → FastAPI (11 routers: auth, projects, requirements, blueprint,
knowledge, traceability, consistency, impact, workflow, export, copilot)
→ {Project Service, RAG Service, Blueprint Service} → Postgres+pgvector / SQLite
```

See `docs/ARCHITECTURE.md` for the full request flow.

## Screenshots

> Add 2–3 captures here after first run (`screenshots/`).

```
screenshots/dashboard.png   # project overview + artifact progress
screenshots/blueprint.png   # PRD → stories → architecture flow
screenshots/traceability.png# coverage, orphans, consistency issues
```

No live demo yet — a 90-sec Loom walkthrough is the highest-ROI next step.

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

## API (selected)

| Method + path | Description |
|---|---|
| `POST /api/auth/register`, `/login`, `/logout`, `GET /me` | Email + bcrypt auth, httpOnly cookie session |
| `CRUD /api/projects` | Project create/list, member guard via `project_or_403` |
| `POST /api/requirements/generate`, `/approve` | RAG-grounded requirement drafts + approval with locking |
| `GET /api/blueprint/{stage}` | PRD, stories, architecture, DB, APIs, security, tasks, tests |
| `GET /api/traceability/coverage` | Coverage %, orphans |
| `POST /api/consistency/check` | Rule-based issue list |
| `POST /api/impact/analyze` | Affected artifacts for a requirement change |
| `GET /api/export/prd.pdf` | PDF export |

## Verify (the bar is "survives review", not "it runs")

```powershell
# Backend: unit + E2E + regression (35 green)
$env:DATABASE_URL="sqlite:///./e2e_test.db"; $env:PYTHONPATH="backend"
python -m pytest backend/tests -q

# Measured benchmark (temp DB, real numbers — see docs/EVALUATION.md)
$env:PYTHONPATH="backend"; python evaluation/benchmark.py --full

# Frontend production build + typecheck
cd frontend; npm ci; npm run build; npm run typecheck
```

## Project structure

```
backend/app/      # api/routes (11), models, rag/, agents/, core/
frontend/         # app/(18 routes), components, lib/api, lib/query
docs/             # SPEC.md, ARCHITECTURE.md, SECURITY.md, EVALUATION.md
evaluation/       # benchmark.py (rag_recall + full_pipeline harness)
scripts/          # init_db.py, install_postgres_windows.ps1
screenshots/      # add demo captures here
```

## What I learned

- Scoped RAG joins + `project_or_403` for multi-tenant isolation; hash-embedding fallback keeps local dev free.
- Optimistic locking + audit logs for safe human-in-the-loop approvals.
- Deterministic evaluation harness beats "it runs" demos in reviews.
