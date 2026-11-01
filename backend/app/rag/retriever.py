"""Hybrid retrieval engine: Dense Vector + BM25 Lexical with RRF and highlighting."""
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from app.rag.embeddings import embed, cosine
from app.rag.vector_store import (
    extract_tokens,
    extract_stems,
    compute_bm25_scores,
    compute_vector_similarities,
    find_highlights,
)


def _tokens(text: str) -> set[str]:
    """Lowercase alphanumeric tokens; hyphens/slashes split (rate-limit → rate, limit)."""
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def _stems(words: set[str]) -> set[str]:
    """Light stemming: 5-char prefixes for long words, exact forms for short ones."""
    out = set()
    for w in words:
        out.add(w if len(w) <= 5 else w[:5])
    return out


def retrieve(chunks: list[dict], query: str, k: int = 5) -> list[dict]:
    """Hybrid retrieval: Dense Vector + BM25 Lexical overlap with section boosting.

    Prefers caller-supplied stored embeddings (one vector per chunk, computed
    at ingest) over re-embedding every chunk per query.
    """
    if not chunks or not (query or "").strip():
        return []

    q_clean = query.strip()
    qv = embed(q_clean)
    q_words = [w for w in extract_tokens(q_clean) if len(w) > 2]
    q_words_set = set(q_words)
    q_stems = extract_stems(q_words)

    # Prepare chunk contents and candidate embeddings
    contents = [c.get("content", "") for c in chunks]
    candidate_embeddings = []
    for c, content in zip(chunks, contents):
        stored = c.get("embedding")
        if isinstance(stored, list) and stored:
            candidate_embeddings.append(stored)
        else:
            candidate_embeddings.append(embed(content[:1000]))

    # Compute vector similarities (numpy-accelerated where possible)
    vec_sims = compute_vector_similarities(qv, candidate_embeddings)

    # Compute lexical BM25 scores
    corpus_tokens = [extract_tokens(cnt) for cnt in contents]
    bm25_sims = compute_bm25_scores(q_words, corpus_tokens)

    scored = []
    for i, c in enumerate(chunks):
        cnt = contents[i]
        v_sim = vec_sims[i]
        b_sim = bm25_sims[i]

        # Stem matching bonus
        c_stems = extract_stems(corpus_tokens[i])
        lex_overlap = len(q_stems & c_stems) / max(1, len(q_stems)) if q_stems else 0.0

        # Section boost if section title contains query keywords
        sec = str(c.get("section", "")).lower()
        sec_boost = 0.15 if any(qw in sec for qw in q_words) else 0.0

        # Hybrid fusion
        lex_combined = max(b_sim, lex_overlap)
        final_score = (0.65 * v_sim) + (0.35 * lex_combined) + sec_boost
        final_score = min(1.0, max(0.0, final_score))

        highlights = find_highlights(cnt, q_words_set)

        scored.append({
            "content": cnt[:1200],
            "section": c.get("section", ""),
            "score": round(final_score, 4),
            "similarity": round(v_sim, 4),
            "lexical": round(lex_combined, 4),
            "source": c.get("source", ""),
            "highlights": highlights,
            "raw_chunk": c,
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:k]


def get_evidence(db: Session, project_id: str, query: str, k: int = 5) -> list[dict]:
    """Retrieve top-k relevant knowledge chunks for a project query with hybrid scoring."""
    from app.models.db import Document, DocumentChunk

    rows = (
        db.query(DocumentChunk, Document.name)
        .join(Document, Document.id == DocumentChunk.document_id)
        .filter(Document.project_id == project_id)
        .limit(300)
        .all()
    )
    if not rows:
        return []

    chunks = [
        {
            "id": c.id,
            "content": c.content,
            "section": c.section,
            "source": name,
            "embedding": c.embedding,
        }
        for c, name in rows
    ]
    return retrieve(chunks, query, k=k)


def format_evidence_text(hits: list[dict], max_chars_per_hit: int = 500) -> str:
    """Format retrieved hits into clean contextual evidence for LLM prompts and generators."""
    if not hits:
        return ""
    lines = []
    for h in hits:
        src = h.get("source", "doc")
        sec = h.get("section", "")
        header = f"[{src} · {sec}]" if sec else f"[{src}]"
        lines.append(f"{header}\n{h.get('content', '')[:max_chars_per_hit]}")
    return "\n\n".join(lines)
