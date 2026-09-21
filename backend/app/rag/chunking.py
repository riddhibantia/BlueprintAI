"""Structure-aware chunking: headings + pages preserved (§18)."""
import re

HEADING = re.compile(r"^(#{1,4}\s+.+|[A-Z][A-Z0-9 \-_/]{4,80}$|\d+(\.\d+)*\s+[A-Z].+)$", re.M)


def chunk_text(text: str, target: int = 900, overlap: int = 120) -> list[dict]:
    text = (text or "").strip()
    if not text:
        return []
    # split on headings first
    parts, cur_sec, buf = [], "general", ""
    for line in text.splitlines():
        if HEADING.match(line.strip()) and len(buf) > 200:
            parts.append({"section": cur_sec, "content": buf.strip()})
            cur_sec, buf = line.strip()[:120], ""
        buf += line + "\n"
        if len(buf) >= target * 1.6:
            parts.append({"section": cur_sec, "content": buf.strip()})
            buf = buf[-overlap:]
    if buf.strip():
        parts.append({"section": cur_sec, "content": buf.strip()})
    # hard-split oversized
    out = []
    for p in parts:
        c = p["content"]
        while len(c) > target * 1.5:
            out.append({"section": p["section"], "content": c[:target]})
            c = c[target - overlap:]
        out.append({"section": p["section"], "content": c})
    return [o for o in out if o["content"].strip()]
