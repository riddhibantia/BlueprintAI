"""Structure-aware chunking: headings, sentence boundaries and token preservation (§18)."""
import re
from typing import List, Dict

HEADING = re.compile(
    r"^(#{1,4}\s+.+|[A-Z][A-Z0-9 \-_/]{4,80}$|\d+(\.\d+)*\s+[A-Z].+)$",
    re.M,
)


def _find_split_point(text: str, target: int) -> int:
    """Find a natural break (paragraph, sentence, or word boundary) near the target."""
    if len(text) <= target:
        return len(text)
    window_start = int(target * 0.70)
    window_end = min(len(text), int(target * 1.25))
    sub = text[window_start:window_end]

    # Look for paragraph or sentence endings
    for p in ("\n\n", ".\n", ". ", "? ", "! "):
        idx = sub.rfind(p)
        if idx != -1:
            return window_start + idx + len(p)

    # Fallback to word boundary
    space_idx = text[:target].rfind(" ")
    if space_idx > target * 0.55:
        return space_idx + 1

    return target


def chunk_text(text: str, target: int = 900, overlap: int = 120) -> list[dict]:
    """Split on headings first, then natural boundaries — sections survive chunking (§18)."""
    text = (text or "").strip()
    if not text:
        return []

    parts, cur_sec, buf = [], "general", ""
    for line in text.splitlines():
        stripped = line.strip()
        if HEADING.match(stripped):
            clean_sec = re.sub(r"^[#\d\.\s]+", "", stripped).strip() or stripped
            if not buf.strip():
                cur_sec = clean_sec[:120]
                continue
            elif len(buf.strip()) > 100:
                parts.append({"section": cur_sec, "content": buf.strip()})
                cur_sec, buf = clean_sec[:120], ""
        buf += line + "\n"
        if len(buf) >= target * 1.6:
            parts.append({"section": cur_sec, "content": buf.strip()})
            buf = buf[-overlap:] if len(buf) > overlap else ""

    if buf.strip():
        parts.append({"section": cur_sec, "content": buf.strip()})

    # Hard-split oversized sections on clean sentence / word boundaries
    out = []
    for p in parts:
        c = p["content"]
        while len(c) > target * 1.5:
            sp = _find_split_point(c, target)
            chunk_slice = c[:sp].strip()
            if chunk_slice:
                out.append({"section": p["section"], "content": chunk_slice})
            # Step forward with overlap respecting word boundaries
            ov_start = max(0, sp - overlap)
            while ov_start < len(c) and c[ov_start] not in (" ", "\n") and ov_start < sp:
                ov_start += 1
            c = c[ov_start:].strip()
        if c.strip():
            out.append({"section": p["section"], "content": c.strip()})

    return [o for o in out if o["content"].strip()]
