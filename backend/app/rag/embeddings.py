"""8GB-friendly embeddings: deterministic hash vectors; OpenAI optional."""
import hashlib
import math

DIM = 128


def _hash_embed(text: str, dim: int = DIM) -> list[float]:
    vec = [0.0] * dim
    for tok in text.lower().split():
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(text: str) -> list[float]:
    """8GB-friendly embeddings: deterministic hash vectors, OpenAI-compatible when configured."""
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


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity for same-provider vectors.

    Vectors from different providers (hash 128-d vs OpenAI 1536-d) are not
    comparable — truncating would silently rank on a prefix. Fail closed.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))
