"""Deterministic engine tests (no LLM needed)."""
from app.rag.chunking import chunk_text
from app.rag.embeddings import embed, cosine
from app.rag.retriever import retrieve
from app.rag.text import stem


def test_chunking():
    chunks = chunk_text("# Auth\n" + "login flow " * 200 + "\n## DB\n" + "schema " * 200)
    assert len(chunks) >= 2 and all(c["content"] for c in chunks)


def test_chunking_keeps_sections_small_and_labelled():
    text = "# Policy\n\n" + "\n".join(f"- rule {i} " + "detail " * 20 for i in range(10))
    chunks = chunk_text(text)
    assert all(len(c["content"]) <= 750 for c in chunks)
    assert all(c["section"].startswith("#") for c in chunks)


def test_stemming_unifies_inflections():
    assert len({stem(w) for w in ("migration", "migrations", "migrate")}) == 1
    assert len({stem(w) for w in ("write", "writes", "writing")}) == 1
    assert stem("security") == stem("secure")


def test_heading_is_scored_with_the_body():
    chunks = [{"content": "return 409 when the version is stale",
               "section": "## Conflict handling", "source": "a"},
              {"content": "return 409 when the version is stale",
               "section": "## Logging", "source": "b"}]
    hits = retrieve(chunks, "which status code for a conflicting write", k=2)
    assert hits[0]["source"] == "a"


def test_embeddings_deterministic():
    assert embed("hello world") == embed("hello world")
    assert cosine(embed("auth login"), embed("auth login")) > 0.99


def test_retrieval_prefers_relevant():
    chunks = [{"content": "JWT authentication for APIs", "section": "sec", "source": "a"},
              {"content": "potato farming guide", "section": "misc", "source": "b"}]
    hits = retrieve(chunks, "how to authenticate API with JWT")
    assert hits[0]["source"] == "a"
