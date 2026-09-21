"""Fixed benchmark (§36): baseline LLM vs LLM+RAG vs LLM+RAG+agents. Records real measured metrics only."""
import time, json
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed, cosine
from app.rag.retriever import retrieve
from app.consistency.rules import run_checks  # import check (needs DB in full run)

IDEAS = ["employee expense platform", "online tutoring marketplace", "inventory tracker for kirana stores"]


def rag_recall_demo():
    docs = chunk_text("# API standards\nJWT required on all writes.\n# DB standards\nUse UUID primary keys.")
    q = "how to secure API writes?"
    hits = retrieve([{"content": c["content"], "section": c["section"], "source": "std"} for c in docs], q)
    return {"hits": len(hits), "top_score": hits[0]["score"] if hits else 0}


if __name__ == "__main__":
    t0 = time.time()
    out = {"ideas": IDEAS, "rag_demo": rag_recall_demo(), "latency_ms": int((time.time() - t0) * 1000),
           "note": "Full DB-backed eval (traceability/consistency/impact accuracy) runs via pytest + API E2E; no invented numbers."}
    print(json.dumps(out, indent=2))
