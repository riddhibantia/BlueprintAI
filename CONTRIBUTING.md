# Contributing to BlueprintAI

## Quickstart

```powershell
# Backend (Windows PowerShell)
python -m venv .venv; .\.venv\Scripts\Activate
pip install -r backend/requirements.txt
copy .env.example .env
python scripts/init_db.py
python scripts/seed_demo.py          # optional demo workspace (demo@blueprint.ai / demo12345)
uvicorn app.main:app --reload --app-dir backend --port 8000
```

```bash
# Backend (macOS / Linux)
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
python scripts/init_db.py
uvicorn app.main:app --reload --app-dir backend --port 8000
```

```bash
# Frontend (all platforms)
cd frontend && npm install && npm run dev   # http://localhost:3000/dashboard
```

Postgres + pgvector is optional (production path). SQLite is the local default —
no Docker, no extensions, works on 8 GB machines.

## Verify before pushing

```powershell
$env:PYTHONPATH="backend"; python -m pytest backend/tests -q
cd frontend; npm run typecheck; npm run build
```

CI runs exactly these three gates (`PYTHONPATH=backend` is set in the workflow).

## Conventions

- Backend: FastAPI routers in `backend/app/api/routes/`, business logic in
  `agents/` / `traceability/` / `consistency/` / `impact/`, RAG in `rag/`.
  Metrics are always computed from stored rows — the LLM never invents coverage.
- Frontend: TanStack Query hooks in `lib/query/useArtifacts.ts` (typed via
  `lib/api/types.ts`). Use `next/link` for internal navigation, never `<a href>`
  or `window.location`. Design tokens live in `styles/tokens.css` — no hardcoded hex.
- Errors: server logs carry details; API responses carry safe `detail` strings only.
- RareUI-vendored files (`components/ui/task-list.tsx`, `code-block.tsx`) are
  non-commercial licensed — see `docs/THIRD_PARTY_NOTICES.md` and the LICENSE
  exception. Do not relicense them.
- Never commit `.env`, `*.db`, `uploads/`, or export outputs.
