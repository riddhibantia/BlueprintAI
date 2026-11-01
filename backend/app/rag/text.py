"""Tokenisation and stemming shared by BM25 and the hashed embedder.

Both halves of the hybrid scorer must agree on what a term is. Keeping the
rules in one place is what stops `writes`/`write` and `rate-limit`/`rate
limiting` from matching on one side and missing on the other.
"""
import re

STOPWORDS = frozenset("""
a an and are as at be been being but by can could did do does for from had has
have how if in into is it its may might must no not of on or our per should so
than that the their them then there these they this to use used uses using was
were what when where which who why will with would you your
""".split())

# Inflectional suffixes only. Derivational ones (`-ation`, `-ity`) are handled
# by the 5-character prefix below, which is what keeps migration/migrations/
# migrate and security/secure in the same bucket.
_INFLECTIONAL = ("ings", "ing", "ies", "ied", "es", "ed", "s")


def normalize(text: str) -> str:
    return (text or "").lower()


def tokens(text: str) -> list[str]:
    """Lowercase alphanumeric terms; hyphens/slashes split (`rate-limit`)."""
    return [t for t in re.findall(r"[a-z0-9]+", normalize(text))
            if len(t) > 1 and t not in STOPWORDS]


def stem(word: str) -> str:
    """Strip inflection, drop a trailing `e`, then cap at 5 characters.

    The cap is doing real work: it maps migration/migrations/migrate to
    `migra`, security/secure to `secur`, and paginate/pagination to `pagin`.
    It is deliberately aggressive — collisions cost less than a missed match
    in a corpus this small.
    """
    w = word
    if len(w) <= 3:
        return w
    if w.endswith("ies") and len(w) > 4:
        w = w[:-3] + "y"
    elif w.endswith("ied") and len(w) > 4:
        w = w[:-3] + "y"
    else:
        for suf in _INFLECTIONAL:
            if w.endswith(suf) and len(w) - len(suf) >= 3:
                w = w[:-len(suf)]
                if suf in ("ing", "ed") and w[-1] not in "aeiou":
                    w += "e"  # writ -> write, delet -> delete
                break
    if len(w) > 3 and w.endswith("e"):
        w = w[:-1]
    return w[:5]


def terms(text: str) -> list[str]:
    """Stemmed terms in order; order matters because the embedder uses bigrams."""
    return [stem(t) for t in tokens(text)]
