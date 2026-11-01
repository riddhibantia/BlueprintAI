"""Deterministic traceability: links, coverage, orphans (§14). LLM never invents metrics."""
from sqlalchemy.orm import Session
from app.models.db import TraceabilityLink, Requirement


def add_link(db: Session, project_id: str, st: str, sid: str, tt: str, tid: str, rel: str = "implements"):
    """Store a traceability link (idempotent on the full key)."""
    exists = db.query(TraceabilityLink).filter_by(project_id=project_id, source_type=st,
                                                  source_id=sid, target_type=tt, target_id=tid).first()
    if exists:
        return exists
    link = TraceabilityLink(project_id=project_id, source_type=st, source_id=sid,
                            target_type=tt, target_id=tid, relationship_type=rel)
    db.add(link)
    db.commit()
    return link


def coverage(db: Session, project_id: str) -> dict:
    """Coverage % + orphans, computed from stored links (never estimated)."""
    reqs = db.query(Requirement).filter_by(project_id=project_id).all()
    links = db.query(TraceabilityLink).filter_by(project_id=project_id, source_type="requirement").all()
    covered = {l.source_id for l in links}
    codes = [r.code for r in reqs]
    orphans = [c for c in codes if c not in covered]
    pct = round(100.0 * len(covered) / max(1, len(codes)), 1)
    return {"total": len(codes), "covered": len(covered), "coverage_pct": pct, "orphans": orphans}


def forward(db: Session, project_id: str, req_code: str) -> list[dict]:
    """BFS downstream from a requirement node (REQ -> story/api/task/test/...)."""
    links = db.query(TraceabilityLink).filter_by(project_id=project_id).all()
    # BFS from requirement node
    adj: dict[str, list] = {}
    for l in links:
        adj.setdefault(f"{l.source_type}:{l.source_id}", []).append(l)
    start = f"requirement:{req_code}"
    seen, out, stack = set(), [], [start]
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        for l in adj.get(node, []):
            out.append({"from": f"{l.source_type}:{l.source_id}", "to": f"{l.target_type}:{l.target_id}",
                        "rel": l.relationship_type})
            stack.append(f"{l.target_type}:{l.target_id}")
    return out


def backward(db: Session, project_id: str, artifact_code: str) -> list[dict]:
    """Find everything pointing at an artifact (which requirements affect this API/component?)."""
    links = db.query(TraceabilityLink).filter_by(project_id=project_id, target_id=artifact_code).all()
    return [{"from": f"{l.source_type}:{l.source_id}", "to": f"{l.target_type}:{l.target_id}",
             "rel": l.relationship_type} for l in links]


def clear_links(db: Session, project_id: str, source_type: str = "", target_types: tuple = ()) -> int:
    """Remove stale links before regeneration (re-runs must not accumulate dead targets)."""
    q = db.query(TraceabilityLink).filter_by(project_id=project_id)
    if source_type:
        q = q.filter_by(source_type=source_type)
    if target_types:
        q = q.filter(TraceabilityLink.target_type.in_(target_types))
    n = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return n


def _keywords(text: str) -> set[str]:
    return {w.strip(".,:;()").lower() for w in (text or "").split() if len(w) > 3}


# Words that appear in nearly every requirement or path and therefore carry no
# linking signal. Without this, "manage users" would match every endpoint.
_LINK_STOPWORDS = {
    "with", "that", "this", "from", "into", "only", "must", "when", "then",
    "each", "every", "their", "there", "these", "those", "used", "using",
    "user", "users", "account", "accounts", "system", "data", "app", "apps",
    "api", "apis", "http", "https", "post", "get", "put", "patch", "delete",
    "create", "read", "update", "list", "manage", "record", "records",
    "item", "items", "thing", "things", "detail", "details",
}


def _link_terms(text: str) -> set[str]:
    """Tokens with linking signal: long enough, not generic, crudely stemmed.

    Endpoint paths are tokenised first, otherwise '/tutoring' and 'tutoring'
    are different strings and nothing ever matches.
    """
    import re as _re
    raw = _re.findall(r"[A-Za-z][A-Za-z0-9]*", text or "")
    out = set()
    for w in raw:
        w = w.lower()
        if len(w) < 4 or w in _LINK_STOPWORDS:
            continue
        # crude singular: tutors->tutor, bookings->booking
        if w.endswith("s") and not w.endswith("ss") and len(w) > 4:
            w = w[:-1]
        out.add(w)
    return out


def earned_links(db: Session, project_id: str) -> list[dict]:
    """Requirement -> API links justified by shared terminology.

    Replaces the old positional round-robin (`functional[i] -> apis[i % n]`),
    which fabricated one link per functional requirement regardless of meaning
    and made coverage look healthy while carrying no information. Here a link
    is only returned when the requirement and the endpoint actually share a
    *discriminating* domain term; requirements that match nothing stay orphaned
    on purpose, so the gap is visible instead of being papered over.
    """
    from app.models.db import Requirement, ApiEndpoint
    reqs = db.query(Requirement).filter_by(project_id=project_id).all()
    apis = db.query(ApiEndpoint).filter_by(project_id=project_id).all()
    if not reqs or not apis:
        return []

    req_terms = [(r, _link_terms(f"{r.title} {r.description or ''}")) for r in reqs]
    api_terms = [(a, _link_terms(f"{a.method} {a.path}")) for a in apis]

    # Every generated requirement mentions the product's entity by name, so
    # "tutoring" appears in all of them and cannot discriminate — without this
    # filter everything links to POST /tutoring, which is the same rubber stamp
    # as the round-robin it replaced.
    df: dict[str, int] = {}
    for _, terms in req_terms:
        for t in terms:
            df[t] = df.get(t, 0) + 1
    common = {t for t, n in df.items() if n > max(1, len(req_terms) // 2)}

    out: list[dict] = []
    for r, r_terms in req_terms:
        discriminating = r_terms - common
        if not discriminating:
            continue  # nothing specific to match on: stay orphaned, visibly
        best: tuple[int, ApiEndpoint, set[str]] | None = None
        for a, a_terms in api_terms:
            shared = discriminating & a_terms
            if shared and (best is None or len(shared) > best[0]):
                best = (len(shared), a, shared)
        if best:
            n, a, shared = best
            out.append({"source_type": "requirement", "source_id": r.code,
                        "target_type": "api", "target_id": a.code or a.path,
                        "relationship_type": "implements",
                        "reason": f"shared terms: {sorted(shared)[:4]}"})
    return out


def earned_security_links(db: Session, project_id: str) -> list[dict]:
    """Security control -> API links, placed where the control actually applies.

    The old code attached every control to `first_api`, so an upload-validation
    rule claimed to protect a login endpoint. Controls are matched on scope and
    on the endpoints whose path or auth scheme they concern; a control that
    matches nothing specific is spread across distinct endpoints rather than
    stacked on one, so the graph records coverage instead of a rubber stamp.
    """
    from app.models.db import SecurityRequirement, ApiEndpoint
    secs = db.query(SecurityRequirement).filter_by(project_id=project_id).all()
    apis = db.query(ApiEndpoint).filter_by(project_id=project_id).all()
    if not secs or not apis:
        return []

    api_terms = [(a, _link_terms(f"{a.method} {a.path} {a.auth or ''}")) for a in apis]
    out: list[dict] = []
    for i, s in enumerate(secs):
        s_terms = _link_terms(f"{s.title} {s.description or ''} {s.scope or ''}")
        scored = []
        for a, a_terms in api_terms:
            shared = s_terms & a_terms
            if shared:
                scored.append((len(shared), a, shared))
        scored.sort(key=lambda x: (-x[0], x[1].path or ""))
        if scored:
            for n, a, shared in scored[:2]:  # a control may legitimately guard 2 endpoints
                out.append({"source_type": "security", "source_id": s.code,
                            "target_type": "api", "target_id": a.code or a.path,
                            "relationship_type": "protects",
                            "reason": f"shared terms: {sorted(shared)[:4]}"})
        else:
            # No textual anchor: still record the control somewhere real, but
            # rotate the target so controls do not all alias onto API-001.
            a = apis[i % len(apis)]
            out.append({"source_type": "security", "source_id": s.code,
                        "target_type": "api", "target_id": a.code or a.path,
                        "relationship_type": "protects",
                        "reason": "project-wide control (no endpoint-specific anchor)"})
    return out


def suggest(db: Session, project_id: str) -> list[dict]:
    """Deterministic link suggestions (traceability agent): keyword overlap between
    requirements and downstream artifacts. Suggestions only — the user confirms."""
    from app.models.db import Requirement, UserStory, ApiEndpoint, ImplementationTask, TestCase, DatabaseEntity
    reqs = db.query(Requirement).filter_by(project_id=project_id).all()
    existing = {(l.source_id, l.target_type, l.target_id)
                for l in db.query(TraceabilityLink).filter_by(project_id=project_id).all()}
    candidates: list[tuple[str, str, str]] = []
    for s in db.query(UserStory).filter_by(project_id=project_id).all():
        candidates.append((s.requirement_code, "story", s.code))
    out = []
    # Hoisted out of the per-requirement loop: one query per artifact table,
    # not one full-table scan per requirement.
    pools: list[tuple[str, str, set[str]]] = []
    for a in db.query(ApiEndpoint).filter_by(project_id=project_id).all():
        pools.append(("api", a.code, _keywords(a.method + " " + a.path)))
    for t in db.query(ImplementationTask).filter_by(project_id=project_id).all():
        pools.append(("task", t.code, _keywords(t.title)))
    for t in db.query(TestCase).filter_by(project_id=project_id).all():
        pools.append(("test", t.code, _keywords(t.title)))
    for e in db.query(DatabaseEntity).filter_by(project_id=project_id).all():
        pools.append(("db", e.code or e.name, _keywords(e.name)))
    for r in reqs:
        kw = _keywords(r.title + " " + (r.description or ""))
        if not kw:
            continue
        ranked: list[tuple[int, str, str, set[str]]] = []
        for typ, code, akw in pools:
            overlap = kw & akw
            if overlap and (r.code, typ, code) not in existing:
                ranked.append((len(overlap), typ, code, overlap))
        # Strongest evidence first so the [:100] cap keeps signal, not noise.
        ranked.sort(key=lambda x: x[0], reverse=True)
        for n, typ, code, overlap in ranked:
            out.append({"from": r.code, "to": f"{typ}:{code}", "rel": "implements",
                        "reason": f"shared terms: {sorted(overlap)[:4]}"})
    for s_req, typ, code in candidates:
        if s_req and (s_req, typ, code) not in existing:
            out.append({"from": s_req, "to": f"{typ}:{code}", "rel": "implements",
                        "reason": "story declares this source requirement"})
    return out[:100]
