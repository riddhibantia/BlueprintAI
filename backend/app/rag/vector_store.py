"""Vector database abstraction and hybrid search engine.

Supports vectorized cosine matrix computation via numpy, BM25 lexical ranking,
and Reciprocal Rank Fusion (RRF) hybrid retrieval.
"""
import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger("devblueprint.vector_store")


def extract_tokens(text: str) -> list[str]:
    """Extract lowercase alphanumeric tokens of length > 1."""
    return [t.lower() for t in re.findall(r"[a-z0-9]+", text or "") if len(t) > 1]


def extract_stems(tokens: list[str]) -> set[str]:
    """Lightweight stemming: prefixes for words > 5 chars, full word otherwise."""
    out = set()
    for tok in tokens:
        out.add(tok if len(tok) <= 5 else tok[:5])
    return out


def compute_bm25_scores(
    query_tokens: list[str],
    corpus_tokens: list[list[str]],
    k1: float = 1.2,
    b: float = 0.75,
) -> list[float]:
    """Calculate normalized BM25 scores for a set of documents against query tokens."""
    n_docs = len(corpus_tokens)
    if n_docs == 0 or not query_tokens:
        return [0.0] * n_docs

    doc_lens = [len(dt) for dt in corpus_tokens]
    avg_len = sum(doc_lens) / max(1, n_docs)

    # Document frequency per unique query token
    unique_q = set(query_tokens)
    doc_freqs = {q: sum(1 for dt in corpus_tokens if q in dt) for q in unique_q}

    raw_scores = []
    for i, dt in enumerate(corpus_tokens):
        score = 0.0
        dl = doc_lens[i]
        for q in unique_q:
            df = doc_freqs.get(q, 0)
            if df == 0:
                continue
            # Robertson-Spärck Jones IDF
            idf = math.log((n_docs - df + 0.5) / (df + 0.5) + 1.0)
            tf = dt.count(q)
            denom = tf + k1 * (1.0 - b + b * (dl / max(1.0, avg_len)))
            score += idf * ((tf * (k1 + 1.0)) / max(1e-6, denom))
        raw_scores.append(score)

    max_score = max(raw_scores) if raw_scores else 0.0
    if max_score <= 0.0:
        return [0.0] * n_docs
    return [round(s / max_score, 4) for s in raw_scores]


def compute_vector_similarities(
    query_vector: list[float],
    candidate_vectors: list[Optional[list[float]]],
) -> list[float]:
    """Vectorized cosine similarity with numpy acceleration and pure-Python fallback."""
    n = len(candidate_vectors)
    if n == 0 or not query_vector:
        return [0.0] * n

    # Attempt numpy matrix acceleration if dimensions match
    dim = len(query_vector)
    valid_indices = []
    mat_rows = []
    for i, cv in enumerate(candidate_vectors):
        if cv and isinstance(cv, list) and len(cv) == dim:
            valid_indices.append(i)
            mat_rows.append(cv)

    out = [0.0] * n
    if mat_rows:
        try:
            import numpy as np

            q = np.array(query_vector, dtype=np.float32)
            mat = np.array(mat_rows, dtype=np.float32)
            q_norm = np.linalg.norm(q) or 1.0
            mat_norms = np.linalg.norm(mat, axis=1)
            mat_norms[mat_norms == 0.0] = 1.0

            sims = np.dot(mat, q) / (mat_norms * q_norm)
            for idx, s in zip(valid_indices, sims):
                out[idx] = float(np.clip(s, 0.0, 1.0))
            return out
        except Exception:
            pass  # Fallback to pure Python

    # Pure Python fallback
    q_norm = math.sqrt(sum(x * x for x in query_vector)) or 1.0
    for i, cv in enumerate(candidate_vectors):
        if cv and isinstance(cv, list) and len(cv) == dim:
            dot = sum(x * y for x, y in zip(query_vector, cv))
            c_norm = math.sqrt(sum(y * y for y in cv)) or 1.0
            sim = dot / (q_norm * c_norm)
            out[i] = max(0.0, min(1.0, float(sim)))
        else:
            out[i] = 0.0
    return out


def find_highlights(text: str, query_tokens: set[str], max_highlights: int = 3) -> list[str]:
    """Extract snippet sentences containing query terms for UI highlighting."""
    sentences = re.split(r"(?<=[.!?\n])\s+", text)
    matches = []
    for s in sentences:
        s_clean = s.strip()
        if not s_clean:
            continue
        s_words = set(re.findall(r"[a-z0-9]+", s_clean.lower()))
        if s_words & query_tokens:
            matches.append(s_clean[:180])
            if len(matches) >= max_highlights:
                break
    return matches
