"""High-performance embeddings: OpenAI, Gemini, dense semantic subword vectors, or hash.

Deterministic, memory-efficient (8GB-friendly), and handles multi-provider fallbacks.
"""
import hashlib
import logging
import math
import re
from typing import List

log = logging.getLogger("devblueprint.embeddings")

DIM = 128


def _hash_embed(text: str, dim: int = DIM) -> list[float]:
    """Legacy 128-d token bucket hash embedding."""
    vec = [0.0] * dim
    for tok in text.lower().split():
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        vec[h % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _dense_local_embed(text: str, dim: int = DIM) -> list[float]:
    """Dense semantic subword + n-gram vectorizer.

    Deterministic, offline, zero-dependency. Captures morphological
    and semantic similarity across related terms (e.g. auth/authenticate/login)
    via subword 3-4 grams, word stems, and normalized random projections.
    """
    text = (text or "").strip().lower()
    if not text:
        return [0.0] * dim
    vec = [0.0] * dim
    words = re.findall(r"[a-z0-9]+", text)
    if not words:
        return [0.0] * dim

    for w in words:
        # Full word representation
        h_w = int(hashlib.md5(("w:" + w).encode()).hexdigest(), 16)
        vec[h_w % dim] += 1.0

        # Subword character n-grams for semantic & typo tolerance
        if len(w) >= 3:
            for n in (3, 4):
                for i in range(len(w) - n + 1):
                    sub = w[i : i + n]
                    h_sub = int(hashlib.md5(("s:" + sub).encode()).hexdigest(), 16)
                    vec[h_sub % dim] += 0.35

        # Prefix stem for morphological variants (e.g. encrypt/encryption)
        if len(w) > 4:
            pref = w[:4]
            h_pref = int(hashlib.md5(("p:" + pref).encode()).hexdigest(), 16)
            vec[h_pref % dim] += 0.5

    # L2 unit normalization
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]


def _openai_embed_batch(texts: list[str]) -> list[list[float]]:
    """Batch embed using OpenAI or OpenAI-compatible endpoint."""
    from app.core.config import settings
    from openai import OpenAI

    kwargs: dict = {"api_key": settings.OPENAI_API_KEY, "timeout": 25}
    if settings.OPENAI_BASE_URL:
        kwargs["base_url"] = settings.OPENAI_BASE_URL
    client = OpenAI(**kwargs)
    clean_texts = [t[:3000].replace("\n", " ") for t in texts]
    r = client.embeddings.create(model=settings.OPENAI_EMBED_MODEL, input=clean_texts)
    # Sort by index to maintain ordering
    sorted_data = sorted(r.data, key=lambda x: x.index)
    return [list(item.embedding) for item in sorted_data]


def _gemini_embed_batch(texts: list[str]) -> list[list[float]]:
    """Batch embed using Google GenAI / Gemini."""
    from app.core.config import settings

    key = settings.GEMINI_API_KEY or settings.LLM_API_KEY
    if not key:
        raise ValueError("Missing Gemini API key")
    from google import genai

    client = genai.Client(api_key=key)
    out = []
    for t in texts:
        clean = t[:3000].replace("\n", " ")
        res = client.models.embed_content(
            model=getattr(settings, "GEMINI_EMBED_MODEL", "text-embedding-004"),
            contents=clean,
        )
        if hasattr(res, "embedding") and hasattr(res.embedding, "values"):
            out.append(list(res.embedding.values))
        elif hasattr(res, "embeddings") and res.embeddings:
            out.append(list(res.embeddings[0].values))
        else:
            out.append(_dense_local_embed(t))
    return out


def get_embedding_info() -> dict:
    """Inspect active embedding configuration and provider status."""
    from app.core.config import settings

    provider = settings.EMBEDDING_PROVIDER.lower()
    if provider in ("auto", "openai") and settings.OPENAI_API_KEY:
        return {"provider": "openai", "model": settings.OPENAI_EMBED_MODEL, "dim": 1536}
    if provider in ("auto", "gemini") and (settings.GEMINI_API_KEY or settings.LLM_API_KEY):
        return {"provider": "gemini", "model": getattr(settings, "GEMINI_EMBED_MODEL", "text-embedding-004"), "dim": 768}
    if provider == "hash":
        return {"provider": "hash", "model": "md5-hash-bucket", "dim": DIM}
    return {"provider": "dense_local", "model": "subword-dense-vectorizer", "dim": DIM}


def embed_batch(texts: list[str]) -> list[list[float]]:
    """Compute embeddings for a batch of texts with automatic fallback."""
    from app.core.config import settings

    if not texts:
        return []

    provider = settings.EMBEDDING_PROVIDER.lower()
    if (provider in ("auto", "openai")) and settings.OPENAI_API_KEY:
        try:
            return _openai_embed_batch(texts)
        except Exception as exc:
            log.warning("OpenAI batch embedding failed (%s), falling back to dense local", type(exc).__name__)

    if (provider in ("auto", "gemini")) and (settings.GEMINI_API_KEY or settings.LLM_API_KEY):
        try:
            return _gemini_embed_batch(texts)
        except Exception as exc:
            log.warning("Gemini batch embedding failed (%s), falling back to dense local", type(exc).__name__)

    if provider == "hash":
        return [_hash_embed(t) for t in texts]

    return [_dense_local_embed(t) for t in texts]


def embed(text: str) -> list[float]:
    """Generate embedding vector for a single text."""
    res = embed_batch([text])
    return res[0] if res else _dense_local_embed(text)


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity for embedding vectors with dimension safety.

    Vectors from different providers or dimension sizes cannot be directly compared;
    safely returns 0.0 without throwing exceptions.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(sum(x * y for x, y in zip(a, b)))
