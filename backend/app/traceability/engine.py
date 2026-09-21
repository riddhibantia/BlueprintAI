"""Deterministic traceability: links, coverage, orphans (§14). LLM never invents metrics."""
from sqlalchemy.orm import Session
from app.models.db import TraceabilityLink, Requirement


def add_link(db: Session, project_id: str, st: str, sid: str, tt: str, tid: str, rel: str = "implements"):
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
    reqs = db.query(Requirement).filter_by(project_id=project_id).all()
    links = db.query(TraceabilityLink).filter_by(project_id=project_id, source_type="requirement").all()
    covered = {l.source_id for l in links}
    codes = [r.code for r in reqs]
    orphans = [c for c in codes if c not in covered]
    pct = round(100.0 * len(covered) / max(1, len(codes)), 1)
    return {"total": len(codes), "covered": len(covered), "coverage_pct": pct, "orphans": orphans}


def forward(db: Session, project_id: str, req_code: str) -> list[dict]:
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
