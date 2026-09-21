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
    from app.core.config import settings
    if settings.EMBEDDING_PROVIDER == "openai" and settings.OPENAI_API_KEY:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            r = client.embeddings.create(model=settings.OPENAI_EMBED_MODEL, input=text[:2000])
            return list(r.data[0].embedding)
        except Exception:
            pass
    return _hash_embed(text)


def cosine(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    if n == 0:
        return 0.0
    return sum(a[i] * b[i] for i in range(n))
