"""DevBlueprint FastAPI entrypoint (§24)."""
import logging
import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.api.routes import auth, projects, requirements, blueprint, knowledge, traceability, consistency, impact, workflow, export, copilot

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("devblueprint")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="DevBlueprint API", version="1.0.0", lifespan=lifespan,
              docs_url="/docs" if settings.ENV != "prod" else None,
              redoc_url=None if settings.ENV == "prod" else "/redoc")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list,
                   allow_credentials=True,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
                   max_age=600)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get("X-Request-Id") or str(uuid.uuid4())[:8]
    t0 = time.time()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled error rid=%s %s %s", rid, request.method, request.url.path)
        raise
    response.headers["X-Request-Id"] = rid
    log.info("rid=%s %s %s -> %s %.0fms", rid, request.method, request.url.path,
             response.status_code, (time.time() - t0) * 1000)
    return response

for r in (auth.router, projects.router, requirements.router, blueprint.router, knowledge.router,
          traceability.router, consistency.router, impact.router, workflow.router, export.router, copilot.router):
    app.include_router(r)


@app.get("/health")
def health():
    # Minimal surface: deployment fingerprinting (db kind / provider / env)
    # is only exposed outside production.
    if settings.ENV == "prod":
        return {"status": "ok"}
    return {"status": "ok", "db": "postgres" if settings.is_postgres else "sqlite-fallback",
            "llm": settings.LLM_PROVIDER, "env": settings.ENV}
