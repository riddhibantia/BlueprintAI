"""Deterministic hashed n-gram embeddings; OpenAI optional.

The hash path is not a semantic model and this file does not pretend it is: it
is a signed random projection of stemmed unigrams and bigrams. IDF lives in
the BM25 half of the retriever, so the vector only has to preserve term
overlap and local order (which is what fixes `rate-limit`/`rate limiting`).

DIM changed from 128 to 512 when bigrams were added. Stored vectors of a
different length are re-embedded on read by the retriever (hash provider
only), so existing databases keep working without a migration.
"""
import hashlib
import math

from app.rag.text import terms

DIM = 512
_W_UNIGRAM = 1.0
_W_BIGRAM = 0.6


def _bucket(feature: str, dim: int) -> tuple[int, float]:
    """Signed hashing: the sign keeps collisions from always adding up."""
    digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    n = int.from_bytes(digest, "big")
    return n % dim, (1.0 if (n >> 63) & 1 else -1.0)


def _hash_embed(text: str, dim: int = DIM) -> list[float]:
    vec = [0.0] * dim

    def add(feature: str, weight: float) -> None:
        i, sign = _bucket(feature, dim)
        vec[i] += sign * weight

    toks = terms(text)
    for tok in toks:
        add("w:" + tok, _W_UNIGRAM)
    for a, b in zip(toks, toks[1:]):
        add(f"b:{a}_{b}", _W_BIGRAM)

    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(text: str) -> list[float]:
    """Hash vectors by default; any OpenAI-compatible endpoint when configured."""
    from app.core.config import settings
    if settings.EMBEDDING_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        try:
            from openai import OpenAI
            kwargs: dict = {"api_key": settings.OPENAI_API_KEY}
            if settings.OPENAI_BASE_URL:
                kwargs["base_url"] = settings.OPENAI_BASE_URL
            client = OpenAI(**kwargs)
            r = client.embeddings.create(model=settings.OPENAI_EMBED_MODEL, input=text[:2000])
            return list(r.data[0].embedding)
        except Exception:
            pass
    return _hash_embed(text)


def embed_chunk(section: str, content: str) -> list[float]:
    """Embed the heading with the body.

    A chunk under "## Methods and status codes" should match a status-code
    query even when the body never repeats the word "status". The heading is
    the cheapest relevance signal in the document.
    """
    return embed(f"{section or ''}\n{content or ''}"[:2000])


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity for same-provider vectors.

    Vectors from different providers (hash 512-d vs OpenAI 1536-d) are not
    comparable — truncating would silently rank on a prefix. Fail closed.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))
