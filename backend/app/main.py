"""DevBlueprint FastAPI entrypoint (§24)."""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.api.routes import auth, projects, requirements, blueprint, knowledge, traceability, consistency, impact, workflow, export


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="DevBlueprint API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS.split(","),
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

for r in (auth.router, projects.router, requirements.router, blueprint.router, knowledge.router,
          traceability.router, consistency.router, impact.router, workflow.router, export.router):
    app.include_router(r)


@app.get("/health")
def health():
    return {"status": "ok", "db": "postgres" if settings.is_postgres else "sqlite-fallback",
            "llm": settings.LLM_PROVIDER, "env": settings.ENV}
