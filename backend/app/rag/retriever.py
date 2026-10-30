"""Hybrid retrieval: BM25 over the project corpus + hashed-vector cosine.

The lexical half is real BM25 (IDF, term-frequency saturation, length
normalisation) rather than raw set overlap, so a common word like `endpoint`
cannot outweigh a rare one like `idempotency`. The vector half is a signed
n-gram sketch (see `embeddings.py`); it adds local order, not semantics.

The blend weight was picked on the 43-query fixture in `evaluation/benchmark.py`
and is the single knob to re-tune if the corpus changes shape.
"""
import math

from app.rag.embeddings import DIM, cosine, embed, embed_chunk
from app.rag.text import terms

K1 = 1.2   # BM25 term-frequency saturation
B = 0.75   # BM25 length normalisation
W_VEC = 0.20  # vector share; BM25 carries exact terms (tuned on the fixture)


def _bm25(docs: list[list[str]], query: list[str]) -> list[float]:
    """BM25 scores in [0, 1], normalised by the score of a chunk holding every term."""
    n = len(docs)
    if not n:
        return []
    avgdl = sum(len(d) for d in docs) / n or 1.0

    df: dict[str, int] = {}
    for d in docs:
        for t in set(d):
            df[t] = df.get(t, 0) + 1

    def idf(t: str) -> float:
        return math.log(1 + (n - df.get(t, 0) + 0.5) / (df.get(t, 0) + 0.5))

    present = [t for t in query if df.get(t, 0)]
    ceiling = sum(idf(t) for t in present)
    if not ceiling:
        return [0.0] * n

    out = []
    for d in docs:
        tf: dict[str, int] = {}
        for t in d:
            tf[t] = tf.get(t, 0) + 1
        score = 0.0
        for t in present:
            f = tf.get(t, 0)
            if f:
                score += idf(t) * (f * (K1 + 1)) / (
                    f + K1 * (1 - B + B * len(d) / avgdl))
        out.append(score / ceiling)
    return out


def retrieve(chunks: list[dict], query: str, k: int = 5,
             w_vec: float = W_VEC) -> list[dict]:
    """Rank stored chunks for a query; heading and body are scored together.

    Prefers caller-supplied stored embeddings (computed at ingest) over
    re-embedding every chunk per query. A stored vector of the wrong length
    (an old 128-d row, or a provider switch) is re-embedded on read when the
    hash provider is active; under OpenAI it fails closed to lexical-only so a
    query never fans out into hundreds of API calls.
    """
    if not chunks:
        return []

    qterms = sorted(set(terms(query)))
    docs = [terms(f"{c.get('section', '')}\n{c.get('content', '')}") for c in chunks]
    lexical = _bm25(docs, qterms)

    qv = embed(query)
    # A hash-length query vector means the hash path answered (configured, or
    # OpenAI failed and fell back), so re-embedding stale rows is free.
    hash_provider = len(qv) == DIM

    scored = []
    for c, lex in zip(chunks, lexical):
        stored = c.get("embedding")
        if isinstance(stored, list) and len(stored) == len(qv):
            lv = stored
        elif hash_provider:
            lv = embed_chunk(c.get("section", ""), c.get("content", ""))
        else:
            lv = []
        vec = max(0.0, cosine(qv, lv))
        scored.append((w_vec * vec + (1 - w_vec) * lex, c))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [{"content": c["content"][:1200], "section": c.get("section", ""),
             "score": round(s, 4), "source": c.get("source", "")} for s, c in scored[:k]]
