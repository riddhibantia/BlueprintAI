"""Hybrid retrieval: vector cosine + lexical overlap, then lightweight rerank."""
from app.rag.embeddings import embed, cosine


def _tokens(text: str) -> set[str]:
    """Lowercase alphanumeric tokens; hyphens/slashes split (rate-limit → rate, limit)."""
    import re
    return set(re.findall(r"[a-z0-9]+", text.lower()))


def _stems(words: set[str]) -> set[str]:
    """Light stemming: 5-char prefixes for long words (writes/write,
    idempotent/idempotency), exact forms for short ones."""
    out = set()
    for w in words:
        out.add(w if len(w) <= 5 else w[:5])
    return out


def retrieve(chunks: list[dict], query: str, k: int = 5) -> list[dict]:
    """Hybrid score (vector + lexical) with top-k cutoff; empty base says so upstream.

    Prefers caller-supplied stored embeddings (one vector per chunk, computed
    at ingest) over re-embedding every chunk per query — identical results
    under deterministic providers, and N fewer API calls under OpenAI.
    """
    qv = embed(query)
    qwords = {w for w in _tokens(query) if len(w) > 2}
    qstems = _stems(qwords)
    scored = []
    for c in chunks:
        content = c.get("content", "")
        stored = c.get("embedding")
        lv = stored if isinstance(stored, list) and stored else embed(content)
        vec = cosine(qv, lv)
        cstems = _stems(_tokens(content))
        lex = len(qstems & cstems) / max(1, len(qstems))
        score = 0.65 * vec + 0.35 * lex
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{"content": c["content"][:1200], "section": c.get("section", ""),
             "score": round(s, 4), "source": c.get("source", "")} for s, c in scored[:k]]
