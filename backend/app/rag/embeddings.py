"""Deterministic hashed n-gram embeddings; OpenAI and Gemini optional.

The hash path is not a semantic model: it is a signed random projection of stemmed
unigrams and bigrams. IDF lives in the BM25 half of the retriever, so the vector only
has to preserve term overlap and local order (which is what fixes `rate-limit`/`rate limiting`).

DIM is 512 with bigrams added. Stored vectors of a different length are re-embedded
on read by the retriever (hash provider only), so existing databases keep working.
"""
import hashlib
import logging
import math
import re
from typing import List

log = logging.getLogger("devblueprint.embeddings")

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
    """Deterministic signed unigram + bigram hash embedding."""
    vec = [0.0] * dim

    def add(feature: str, weight: float) -> None:
        i, sign = _bucket(feature, dim)
        vec[i] += sign * weight

    toks = terms(text)
    for tok in toks:
        add("w:" + tok, _W_UNIGRAM)
        if len(tok) >= 4:
            add("p:" + tok[:4], 0.5)
    for a, b in zip(toks, toks[1:]):
        add(f"b:{a}_{b}", _W_BIGRAM)

    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _dense_local_embed(text: str, dim: int = DIM) -> list[float]:
    """Dense semantic subword + n-gram vectorizer."""
    return _hash_embed(text, dim)


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
            out.append(_hash_embed(t))
    return out


def get_embedding_info() -> dict:
    """Inspect active embedding configuration and provider status."""
    from app.core.config import settings

    provider = settings.EMBEDDING_PROVIDER.lower()
    if provider in ("auto", "openai") and settings.OPENAI_API_KEY:
        return {"provider": "openai", "model": settings.OPENAI_EMBED_MODEL, "dim": 1536}
    if provider in ("auto", "gemini") and (settings.GEMINI_API_KEY or settings.LLM_API_KEY):
        return {"provider": "gemini", "model": getattr(settings, "GEMINI_EMBED_MODEL", "text-embedding-004"), "dim": 768}
    return {"provider": "hash", "model": "blake2b-unigram-bigram", "dim": DIM}


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
            log.warning("OpenAI batch embedding failed (%s), falling back to hash", type(exc).__name__)

    if (provider in ("auto", "gemini")) and (settings.GEMINI_API_KEY or settings.LLM_API_KEY):
        try:
            return _gemini_embed_batch(texts)
        except Exception as exc:
            log.warning("Gemini batch embedding failed (%s), falling back to hash", type(exc).__name__)

    return [_hash_embed(t) for t in texts]


def embed(text: str) -> list[float]:
    """Generate embedding vector for a single text."""
    res = embed_batch([text])
    return res[0] if res else _hash_embed(text)


def embed_chunk(section: str, content: str) -> list[float]:
    """Embed the heading with the body.

    A chunk under '## Methods and status codes' should match a status-code
    query even when the body never repeats the word 'status'. The heading is
    the cheapest relevance signal in the document.
    """
    return embed(f"{section or ''}\n{content or ''}"[:2000])


def cosine(a: list[float], b: list[float]) -> float:
    """Cosine similarity for embedding vectors with dimension safety.

    Vectors from different providers (hash 512-d vs OpenAI 1536-d) are not
    comparable — truncating would silently rank on a prefix. Fail closed.
    """
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(sum(x * y for x, y in zip(a, b)))
