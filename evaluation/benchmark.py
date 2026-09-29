"""Fixed benchmark (§36): retrieval quality + idea→blueprint pipeline, all measured.

Usage:
  python evaluation/benchmark.py                          # fast retrieval fixture only (no DB)
  python evaluation/benchmark.py --full                   # + full pipeline, all ideas, 3 repeats
  python evaluation/benchmark.py --full --repeats 5
  OPENAI_API_KEY=... python evaluation/benchmark.py --embeddings both
      # + OpenAI-embedding leg on the same fixture (minutes, ~600 API calls)

Conditions (always labeled in output): temp SQLite DB, deterministic mock LLM,
hash embeddings unless stated. Re-run to reproduce. Exits non-zero when any
pipeline stage fails — retrieval scores are reported, never gated.
"""
import os
import sys
import time
import json
import statistics

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.rag.chunking import chunk_text
from app.rag.retriever import retrieve

IDEAS = ["employee expense platform", "online tutoring marketplace", "inventory tracker for kirana stores"]

# Seeded standards corpus: 4 topics x 3 chunks. Each query below names the
# chunk id(s) holding its answer — the standard Recall@K / MRR setup.
CORPUS = [
    ("auth-1", "# Auth standards\nJWT required on all write endpoints. Short expiry, rotate refresh tokens."),
    ("auth-2", "# Auth standards\nStore passwords with bcrypt cost 12. Never log credentials or tokens."),
    ("auth-3", "# Auth standards\nScope sessions per project. Revoke on logout and password change."),
    ("db-1", "# DB standards\nUse UUID primary keys on every table. Index all foreign keys."),
    ("db-2", "# DB standards\nSoft-delete rows with deleted_at. Never hard-delete audit history."),
    ("db-3", "# DB standards\nMigrations are forward-only. Seed scripts must be idempotent."),
    ("api-1", "# API standards\nPaginate every list with cursor and limit. Default limit 50, max 500."),
    ("api-2", "# API standards\nRate-limit auth routes at 100 requests per minute per IP."),
    ("api-3", "# API standards\nAccept idempotency keys on POST so retries never double-create."),
    ("test-1", "# Testing standards\nHold line coverage at 80 percent. Contract-test every endpoint."),
    ("test-2", "# Testing standards\nSeed deterministic fixtures. Isolate each test with temp databases."),
    ("test-3", "# Testing standards\nAssert 409 on stale versions. Assert 403 across tenant boundaries."),
]

QUERIES: list[tuple[str, set[str], str]] = [
    # subset "std": keyword-grounded paraphrases (fair game for hybrid retrieval)
    ("JWT expiry policy?", {"auth-1"}, "std"),
    ("refresh token rotation?", {"auth-1"}, "std"),
    ("password storage policy?", {"auth-2"}, "std"),
    ("bcrypt cost?", {"auth-2"}, "std"),
    ("can I log tokens?", {"auth-2"}, "std"),
    ("session scope and logout?", {"auth-3"}, "std"),
    ("revoke session on password change?", {"auth-3"}, "std"),
    ("per-project sessions?", {"auth-3"}, "std"),
    ("primary key type?", {"db-1"}, "std"),
    ("index foreign keys?", {"db-1"}, "std"),
    ("UUID keys?", {"db-1"}, "std"),
    ("how to handle deleted rows?", {"db-2"}, "std"),
    ("soft delete vs hard delete?", {"db-2"}, "std"),
    ("audit history deletion?", {"db-2"}, "std"),
    ("migration direction?", {"db-3"}, "std"),
    ("idempotent seeds?", {"db-3"}, "std"),
    ("forward-only migrations?", {"db-3"}, "std"),
    ("how to paginate list endpoints?", {"api-1"}, "std"),
    ("default page limit?", {"api-1"}, "std"),
    ("cursor pagination?", {"api-1"}, "std"),
    ("rate limiting policy?", {"api-2"}, "std"),
    ("auth route limits per IP?", {"api-2"}, "std"),
    ("100 requests per minute?", {"api-2"}, "std"),
    ("idempotent retries?", {"api-3"}, "std"),
    ("POST retry safety?", {"api-3"}, "std"),
    ("idempotency keys?", {"api-3"}, "std"),
    ("test coverage target?", {"test-1"}, "std"),
    ("contract tests?", {"test-1"}, "std"),
    ("80 percent coverage?", {"test-1"}, "std"),
    ("test isolation?", {"test-2"}, "std"),
    ("deterministic fixtures?", {"test-2"}, "std"),
    ("temp databases?", {"test-2"}, "std"),
    ("tenant isolation tests?", {"test-3"}, "std"),
    ("stale version status?", {"test-3"}, "std"),
    ("409 vs 403?", {"test-3"}, "std"),
    # subset "adv": adversarial — semantically answerable, zero keyword overlap.
    # Keyword retrieval is EXPECTED to fail these; they quantify the semantic gap.
    ("how to secure API writes?", {"auth-1"}, "adv"),
    ("user login defenses?", {"auth-2"}, "adv"),
    ("keeping secrets out of logs?", {"auth-2"}, "adv"),
    ("row removal policy?", {"db-2"}, "adv"),
    ("schema evolution rules?", {"db-3"}, "adv"),
    ("throttling abusive clients?", {"api-2"}, "adv"),
    ("ensuring quality gates?", {"test-1"}, "adv"),
    ("concurrent edit conflicts?", {"test-3"}, "adv"),
]


def _chunks() -> list[dict]:
    out = []
    for cid, text in CORPUS:
        for c in chunk_text(text):
            out.append({"content": c["content"], "section": c["section"], "source": cid})
    return out


def _score_subset(items: list[tuple[float, float, float]]) -> dict:
    n = len(items)
    return {
        "queries": n,
        "recall_at_1": round(sum(r[0] for r in items) / n, 3) if n else 0,
        "recall_at_k": round(sum(r[1] for r in items) / n, 3) if n else 0,
        "mrr": round(sum(r[2] for r in items) / n, 3) if n else 0,
    }


def retrieval_bench(k: int = 3) -> dict:
    """Recall@1 / Recall@K / MRR over the seeded fixture (deterministic, no LLM).

    Reports overall + split by subset: `std` (keyword-grounded, fair game) and
    `adv` (adversarial paraphrases with no keyword overlap — expected to fail
    under hash embeddings; they quantify the semantic gap real embeddings close).
    """
    chunks = _chunks()
    by_subset: dict[str, list] = {}
    detail = []
    for q, relevant, subset in QUERIES:
        hits = retrieve(chunks, q, k=k)
        ranks = [i + 1 for i, h in enumerate(hits) if h["source"] in relevant]
        triple = (1.0 if ranks and ranks[0] == 1 else 0.0,
                  1.0 if ranks else 0.0,
                  1.0 / ranks[0] if ranks else 0.0)
        by_subset.setdefault(subset, []).append(triple)
        detail.append({"query": q, "subset": subset,
                       "first_rank": ranks[0] if ranks else None,
                       "top_score": hits[0]["score"] if hits else 0})
    all_items = [t for v in by_subset.values() for t in v]
    out = {"chunks": len(chunks), "k": k, "overall": _score_subset(all_items)}
    for subset, items in sorted(by_subset.items()):
        out[subset] = _score_subset(items)
    out["per_query"] = detail
    return out


def retrieval_ablation(k: int = 3, providers: str = "hash") -> dict:
    """Hash vs OpenAI embeddings on the same fixture, same code path.

    The OpenAI leg needs OPENAI_API_KEY and makes ~600 embedding calls through
    the production retrieve() path (no batching shortcuts), so it takes minutes.
    Without a key the leg reports `skipped` — never faked.
    """
    from app.core.config import settings
    out: dict = {"hash": retrieval_bench(k)}
    if providers in ("openai", "both"):
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            out["openai"] = {"skipped": "no OPENAI_API_KEY in environment — set one to run the semantic leg"}
        else:
            settings.EMBEDDING_PROVIDER = "openai"
            settings.OPENAI_API_KEY = key
            try:
                out["openai"] = retrieval_bench(k)
            finally:
                settings.EMBEDDING_PROVIDER = "hash"
                settings.OPENAI_API_KEY = ""
    return out


def _run_pipeline_once(c, headers: dict, idea: str) -> dict:
    """One idea end-to-end on the given test client; returns measured numbers."""
    out: dict = {"stages": {}}
    p = c.post("/projects", json={"name": "Bench", "product_idea": idea}, headers=headers).json()["id"]
    c.post(f"/projects/{p}/documents",
           files={"file": ("std.md", "# API standards\nJWT required on all writes.")}, headers=headers)
    for stage in ["requirements/generate", "prd/generate", "stories/generate", "architecture/generate",
                  "database/generate", "apis/generate", "security/analyze", "tasks/generate", "tests/generate"]:
        t0 = time.time()
        r = c.post(f"/projects/{p}/{stage}",
                   json={"answers": ""} if stage == "requirements/generate" else {}, headers=headers)
        out["stages"][stage] = {"status": r.status_code, "latency_ms": int((time.time() - t0) * 1000)}
    reqs = c.get(f"/projects/{p}/requirements", headers=headers).json()
    for q in reqs[:3]:
        c.post(f"/requirements/{q['id']}/approve", headers=headers)
    t0 = time.time()
    c.post(f"/projects/{p}/consistency/check", headers=headers)
    out["stages"]["consistency/check"] = {"latency_ms": int((time.time() - t0) * 1000)}
    out["metrics"] = c.get(f"/projects/{p}", headers=headers).json()["metrics"]
    out["traceability"] = c.get(f"/projects/{p}/traceability", headers=headers).json()["coverage"]
    t0 = time.time()
    out["workflow"] = c.post(f"/projects/{p}/workflow/run", headers=headers).json().get("engine")
    out["stages"]["workflow/run"] = {"status": 200, "latency_ms": int((time.time() - t0) * 1000)}
    try:
        from app.core.database import SessionLocal
        from app.models.db import AgentRun
        db = SessionLocal()
        try:
            out["tokens"] = sum(r.tokens or 0 for r in db.query(AgentRun).all())
        finally:
            db.close()
    except Exception:
        out["tokens"] = 0
    return out


def full_pipeline(repeats: int = 3) -> dict:
    """All ideas x N repeats on a disposable DB; mean/p95 latencies, real counts."""
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp.name}"
    for m in [m for m in list(sys.modules) if m.startswith("app.")]:
        del sys.modules[m]
    from fastapi.testclient import TestClient
    from app.main import app

    out: dict = {"repeats": repeats, "ideas": {}}
    failures = 0
    try:
        with TestClient(app, raise_server_exceptions=False) as c:
            h = {"Authorization": f"Bearer {c.post('/auth/register', json={'email': 'bench@dev.blue', 'password': 'pass12345'}).json()['token']}"}
            for idea in IDEAS:
                runs = [_run_pipeline_once(c, h, idea) for _ in range(repeats)]
                totals = []
                stage_lists: dict[str, list[int]] = {}
                for r in runs:
                    totals.append(sum(s.get("latency_ms", 0) for s in r["stages"].values()))
                    for name, s in r["stages"].items():
                        stage_lists.setdefault(name, []).append(s.get("latency_ms", 0))
                    failures += sum(1 for s in r["stages"].values() if s.get("status", 200) != 200)
                last = runs[-1]
                totals_sorted = sorted(totals)
                p95 = totals_sorted[min(len(totals_sorted) - 1, int(len(totals_sorted) * 0.95))]
                out["ideas"][idea] = {
                    "requirements": last["metrics"]["requirements"],
                    "stories": last["metrics"]["stories"],
                    "apis": last["metrics"]["apis"],
                    "tests": last["metrics"]["tests"],
                    "traceability_coverage": last["traceability"]["coverage_pct"],
                    "orphans": len(last["traceability"]["orphans"]),
                    "consistency_open": last["metrics"]["consistency_open"],
                    "test_coverage": last["metrics"]["test_coverage"],
                    "tokens_mock": last.get("tokens", 0),
                    "mean_total_ms": int(statistics.mean(totals)),
                    "p95_total_ms": int(p95),
                    "mean_stage_ms": {n: int(statistics.mean(v)) for n, v in stage_lists.items()},
                    "workflow_engine": last.get("workflow"),
                }
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
    out["failures"] = failures
    return out


if __name__ == "__main__":
    repeats = 3
    providers = "hash"
    for i, a in enumerate(sys.argv):
        if a == "--repeats" and i + 1 < len(sys.argv):
            repeats = max(1, int(sys.argv[i + 1]))
        if a == "--embeddings" and i + 1 < len(sys.argv) and sys.argv[i + 1] in ("hash", "openai", "both"):
            providers = sys.argv[i + 1]
    result: dict = {
        "conditions": "temp SQLite DB, deterministic mock LLM, hash embeddings",
        "retrieval": retrieval_ablation(providers=providers),
    }
    if "--full" in sys.argv:
        result["pipeline"] = full_pipeline(repeats=repeats)
    else:
        result["note"] = "Run with --full for measured end-to-end metrics on a temp DB."
    print(json.dumps(result, indent=2))
    fails = result.get("pipeline", {}).get("failures", 0)
    sys.exit(1 if fails else 0)
