"""Structure-aware chunking: headings + pages preserved (A18)."""
import re

HEADING = re.compile(r"^(#{1,4}\s+.+|[A-Z][A-Z0-9 \-_/]{4,80}$|\d+(\.\d+)*\s+[A-Z].+)$", re.M)

MIN_SECTION = 80  # a heading only splits off a section that says something


def chunk_text(text: str, target: int = 500, overlap: int = 80) -> list[dict]:
    """Split on headings first, then by size — sections survive chunking (A18).

    Chunks are smaller than they used to be (500 vs 900 chars) so one chunk
    holds one rule instead of averaging four. The heading becomes the chunk's
    `section` and is scored with the body by the retriever.
    """
    text = (text or "").strip()
    if not text:
        return []

    parts, cur_sec, buf = [], "general", ""
    for line in text.splitlines():
        stripped = line.strip()
        if HEADING.match(stripped):
            if buf.strip() and len(buf.strip()) >= MIN_SECTION:
                parts.append({"section": cur_sec, "content": buf.strip()})
                buf = ""
            cur_sec = stripped[:120]
        buf += line + "\n"
        if len(buf) >= target * 1.6:
            parts.append({"section": cur_sec, "content": buf.strip()})
            buf = buf[-overlap:]
    if buf.strip():
        parts.append({"section": cur_sec, "content": buf.strip()})

    out = []
    for p in parts:
        content = p["content"]
        while len(content) > target * 1.5:
            out.append({"section": p["section"], "content": content[:target]})
            content = content[target - overlap:]
        out.append({"section": p["section"], "content": content})
    return [o for o in out if o["content"].strip()]
