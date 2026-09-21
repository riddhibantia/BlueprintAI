"""Deterministic engine tests (no LLM needed)."""
from app.consistency.rules import run_checks
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed, cosine
from app.rag.retriever import retrieve


def test_chunking():
    chunks = chunk_text("# Auth\n" + "login flow " * 200 + "\n## DB\n" + "schema " * 200)
    assert len(chunks) >= 2 and all(c["content"] for c in chunks)


def test_embeddings_deterministic():
    assert embed("hello world") == embed("hello world")
    assert cosine(embed("auth login"), embed("auth login")) > 0.99


def test_retrieval_prefers_relevant():
    chunks = [{"content": "JWT authentication for APIs", "section": "sec", "source": "a"},
              {"content": "potato farming guide", "section": "misc", "source": "b"}]
    hits = retrieve(chunks, "how to authenticate API with JWT")
    assert hits[0]["source"] == "a"
