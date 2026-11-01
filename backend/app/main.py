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


# In-memory sliding window rate limiter (no external Redis dependency required)
_RATE_LIMITS: dict[str, list[float]] = {}

def _check_rate_limit(client_ip: str, path: str) -> bool:
    if not settings.RATE_LIMIT_ENABLED:
        return True
    now = time.time()
    # Stricter limit on auth routes (30/min) and copilot (60/min), standard (300/min) elsewhere
    if path.startswith("/auth/login") or path.startswith("/auth/reset") or path.startswith("/auth/register"):
        max_reqs, window = 30, 60.0
    elif "/copilot/ask" in path:
        max_reqs, window = 60, 60.0
    else:
        max_reqs, window = 300, 60.0

    key = f"{client_ip}:{path.split('?')[0]}"
    timestamps = _RATE_LIMITS.setdefault(key, [])
    # purge old timestamps outside window
    cutoff = now - window
    _RATE_LIMITS[key] = [t for t in timestamps if t > cutoff]
    if len(_RATE_LIMITS[key]) >= max_reqs:
        return False
    _RATE_LIMITS[key].append(now)
    return True


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    from fastapi.responses import JSONResponse
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not _check_rate_limit(client_ip, request.url.path):
        return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})

    rid = request.headers.get("X-Request-Id") or str(uuid.uuid4())[:8]
    t0 = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:
        log.exception("unhandled error rid=%s %s %s", rid, request.method, request.url.path)
        # Safe global error handler: Never leak stack traces to client in production
        detail = str(exc) if settings.ENV != "prod" else "Internal server error"
        response = JSONResponse(status_code=500, content={"detail": detail, "request_id": rid})

    # Standard OWASP security headers
    response.headers["X-Request-Id"] = rid
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.ENV == "prod":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

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
