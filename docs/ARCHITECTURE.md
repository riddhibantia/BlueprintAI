# Architecture

BlueprintAI turns a raw idea into reviewed engineering artifacts: PRD → stories → architecture → DB/APIs/security → tasks → tests, with traceability, consistency checks, impact analysis, and PDF export.

```
Next.js 16 (frontend/)
  │  REST + httpOnly SameSite=Lax cookie (Authorization header fallback)
  ▼
FastAPI (backend/app/main.py, 11 routers)
  ├── Project Service  — projects, members, auth (JWT + bcrypt SHA-256 pre-stretch)
  ├── Knowledge / RAG  — upload (PDF/TXT/MD, 15MB, uuid files) → chunk → hash/OpenAI
  │                       embeddings → pgvector (prod) / SQLite join fallback (local)
  ├── Blueprint Service — LangGraph multi-agent generation with sequential fallback,
  │                       every stage cites retrieved evidence (AgentRun.evidence)
  ├── Traceability / Consistency / Impact — coverage %, orphan detection,
  │                       rule checks, affected-artifact analysis (deterministic, §30)
  └── Export — PRD / architecture PDF via ReportLab, Archify diagram IR
  ▼
Postgres + pgvector (prod) / SQLite (local dev, devblueprint.db)
```

## Request flow

1. User creates project → clarifies → generates requirements → approves each stage.
2. Each generation step retrieves project-scoped knowledge chunks (`project_or_403` + scoped join) before calling the LLM.
3. Mock LLM by default (`LLM_PROVIDER=mock`, zero GPU/RAM); set `OPENAI_API_KEY` for real inference.
4. Optimistic locking (`expected_version` → 409 on stale writes) prevents silent overwrites.
5. All mutations write audit logs (no document contents or secrets).

## RAG + LangGraph

- `backend/app/rag/{chunking,embeddings,retriever}.py` — chunking, hash fallback + OpenAI embeddings.
- `backend/app/agents/{base,generators}.py` — LangGraph workflow; falls back to sequential pipeline and reports which path ran in `evaluation/benchmark.py`.
- Full spec: `docs/SPEC.md`. Security boundaries: `docs/SECURITY.md`. Measured numbers: `docs/EVALUATION.md`.
