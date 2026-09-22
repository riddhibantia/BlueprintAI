"""Hybrid retrieval: vector cosine + lexical overlap, then lightweight rerank."""
from app.rag.embeddings import embed, cosine


def retrieve(chunks: list[dict], query: str, k: int = 5) -> list[dict]:
    """Hybrid score (vector + lexical) with top-k cutoff; empty base says so upstream."""
    q = query.lower()
    qv = embed(query)
    scored = []
    for c in chunks:
        content = c.get("content", "")
        lv = embed(content)
        vec = cosine(qv, lv)
        words = set(q.split())
        lex = sum(1 for w in words if len(w) > 2 and w in content.lower()) / max(1, len(words))
        score = 0.65 * vec + 0.35 * lex
        scored.append((score, c))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [{"content": c["content"][:1200], "section": c.get("section", ""),
             "score": round(s, 4), "source": c.get("source", "")} for s, c in scored[:k]]
