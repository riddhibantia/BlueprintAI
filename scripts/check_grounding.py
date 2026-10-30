"""Smoke check: the seeded standards pack actually grounds generation.

Runs the real API stack against a throwaway SQLite database, then asserts that
a brand-new project already has indexed standards, that retrieval returns them,
and that the retrieved text reaches the generated PRD. No API keys needed.

Usage (from repo root):
    python scripts/check_grounding.py
"""
import logging
import os
import tempfile

fd, path = tempfile.mkstemp(prefix="blueprintai_grounding_", suffix=".db")
os.close(fd)
os.environ["DATABASE_URL"] = f"sqlite:///{path}"

logging.getLogger("blueprintai").setLevel(logging.WARNING)
logging.getLogger("httpx2").setLevel(logging.WARNING)

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import engine  # noqa: E402
from app.main import app  # noqa: E402


def main() -> None:
    try:
        with TestClient(app) as c:
            r = c.post("/auth/register", json={"email": "check@dev.blue",
                                               "password": "pass12345", "name": "Check"})
            h = {"Authorization": f"Bearer {r.json()['token']}"}
            p = c.post("/projects", headers=h, json={
                "name": "Grounding check",
                "product_idea": "Build an employee expense platform."}).json()
            pid = p["id"]
            assert p["standards"] >= 3, p
            print(f"project created with {p['standards']} built-in standards")

            docs = c.get(f"/projects/{pid}/documents", headers=h).json()
            for d in docs:
                print(f"  {d['name']:<24} {d['chunks']:>2} chunks  source={d['source']}")
                assert d["chunks"] > 0

            q = c.post(f"/projects/{pid}/knowledge/query", headers=h, json={
                "query": "What status code should a conflicting write return?"}).json()
            assert q["hits"], "seeded standards were not retrievable"
            print("\nretrieval top-3:")
            for hit in q["hits"][:3]:
                print(f"  {hit['score']:.3f}  {hit['source']} :: {hit['section']}")

            c.post(f"/projects/{pid}/requirements/generate", headers=h,
                   json={"answers": "managers approve"})
            for req in c.get(f"/projects/{pid}/requirements", headers=h).json():
                c.post(f"/requirements/{req['id']}/approve", headers=h)
            c.post(f"/projects/{pid}/prd/generate", headers=h, json={})
            prd = c.get(f"/projects/{pid}/prd", headers=h).json()["content"]
            assumption = prd["assumptions"][0]

            # The PRD asks RAG for evidence on the project idea. Re-run that
            # exact query and prove the assumption text really came from a
            # retrieved chunk (not just that some chunk mentions "standards").
            idea_hits = c.post(f"/projects/{pid}/knowledge/query", headers=h, json={
                "query": "Build an employee expense platform.", "k": 5}).json()["hits"]
            assert any(assumption[:60] in hit["content"] for hit in idea_hits), \
                f"PRD assumption is not from retrieved evidence: {assumption[:120]}"
            print("\nPRD assumption grounded in retrieved evidence:")
            print("  " + assumption[:200].replace("\n", " "))
            print("\nOK: RAG is grounded on first load, no upload required.")
    finally:
        engine.dispose()
        try:
            os.unlink(path)
        except OSError:
            pass


if __name__ == "__main__":
    main()
