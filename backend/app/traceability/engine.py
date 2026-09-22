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
    for r in reqs:
        kw = _keywords(r.title + " " + (r.description or ""))
        if not kw:
            continue
        pools = []
        for a in db.query(ApiEndpoint).filter_by(project_id=project_id).all():
            pools.append(("api", a.code, _keywords(a.method + " " + a.path)))
        for t in db.query(ImplementationTask).filter_by(project_id=project_id).all():
            pools.append(("task", t.code, _keywords(t.title)))
        for t in db.query(TestCase).filter_by(project_id=project_id).all():
            pools.append(("test", t.code, _keywords(t.title)))
        for e in db.query(DatabaseEntity).filter_by(project_id=project_id).all():
            pools.append(("db", e.code or e.name, _keywords(e.name)))
        for typ, code, akw in pools:
            overlap = kw & akw
            if len(overlap) >= 1 and (r.code, typ, code) not in existing:
                out.append({"from": r.code, "to": f"{typ}:{code}", "rel": "implements",
                            "reason": f"shared terms: {sorted(overlap)[:4]}"})
    for s_req, typ, code in candidates:
        if s_req and (s_req, typ, code) not in existing:
            out.append({"from": s_req, "to": f"{typ}:{code}", "rel": "implements",
                        "reason": "story declares this source requirement"})
    return out[:100]
