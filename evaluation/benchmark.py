"""Fixed benchmark (§36): representative ideas + measured pipeline metrics.

Usage:
  python evaluation/benchmark.py          # fast RAG demo only
  python evaluation/benchmark.py --full   # full pipeline on a temp DB, real numbers
"""
import os
import sys
import time
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.rag.chunking import chunk_text
from app.rag.embeddings import embed
from app.rag.retriever import retrieve

IDEAS = ["employee expense platform", "online tutoring marketplace", "inventory tracker for kirana stores"]


def rag_recall_demo():
    """Seeded-standards retrieval check (deterministic, no LLM)."""
    docs = chunk_text("# API standards\nJWT required on all writes.\n# DB standards\nUse UUID primary keys.")
    q = "how to secure API writes?"
    hits = retrieve([{"content": c["content"], "section": c["section"], "source": "std"} for c in docs], q)
    return {"hits": len(hits), "top_score": hits[0]["score"] if hits else 0}


def full_pipeline():
    """Timed idea→blueprint run on a disposable DB; every number is measured."""
    import tempfile
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ["DATABASE_URL"] = f"sqlite:///{tmp.name}"
    for m in [m for m in list(sys.modules) if m.startswith("app.")]:
        del sys.modules[m]
    from fastapi.testclient import TestClient
    from app.main import app

    out: dict = {"stages": {}}
    t_all = time.time()
    try:
        with TestClient(app) as c:
            h = {"Authorization": f"Bearer {c.post('/auth/register', json={'email': 'bench@dev.blue', 'password': 'pass12345'}).json()['token']}"}
            p = c.post("/projects", json={"name": "Bench", "product_idea": IDEAS[0]}, headers=h).json()["id"]
            # seed one knowledge doc so RAG evidence is exercised
            c.post(f"/projects/{p}/documents", files={"file": ("std.md", "# API standards\nJWT required on all writes.")}, headers=h)
            for stage in ["requirements/generate", "prd/generate", "stories/generate", "architecture/generate",
                          "database/generate", "apis/generate", "security/analyze", "tasks/generate", "tests/generate"]:
                t0 = time.time()
                r = c.post(f"/projects/{p}/{stage}", json={"answers": ""} if stage == "requirements/generate" else {}, headers=h)
                out["stages"][stage] = {"status": r.status_code, "latency_ms": int((time.time() - t0) * 1000)}
            reqs = c.get(f"/projects/{p}/requirements", headers=h).json()
            for q in reqs[:3]:
                c.post(f"/requirements/{q['id']}/approve", headers=h)
            t0 = time.time()
            c.post(f"/projects/{p}/consistency/check", headers=h)
            out["stages"]["consistency/check"] = {"latency_ms": int((time.time() - t0) * 1000)}
            out["metrics"] = c.get(f"/projects/{p}", headers=h).json()["metrics"]
            out["traceability"] = c.get(f"/projects/{p}/traceability", headers=h).json()["coverage"]
            out["workflow"] = c.post(f"/projects/{p}/workflow/run", headers=h).json().get("engine")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
    out["total_latency_ms"] = int((time.time() - t_all) * 1000)
    out["failures"] = sum(1 for s in out["stages"].values() if s.get("status", 200) != 200)
    return out


if __name__ == "__main__":
    result: dict = {"ideas": IDEAS, "rag_demo": rag_recall_demo()}
    if "--full" in sys.argv:
        result["full"] = full_pipeline()
    else:
        result["note"] = "Run with --full for measured end-to-end metrics on a temp DB."
    print(json.dumps(result, indent=2))
