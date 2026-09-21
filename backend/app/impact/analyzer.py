"""Impact analysis: deterministic BFS over traceability graph + LLM explanation."""
from sqlalchemy.orm import Session
from app.models.db import TraceabilityLink
from app.agents.base import complete


def analyze(db: Session, project_id: str, req_code: str) -> dict:
    links = db.query(TraceabilityLink).filter_by(project_id=project_id).all()
    adj: dict[str, list[str]] = {}
    for l in links:
        adj.setdefault(f"{l.source_type}:{l.source_id}", []).append(f"{l.target_type}:{l.target_id}")
    start = f"requirement:{req_code}"
    seen, order, stack = set(), [], [start]
    while stack:
        n = stack.pop()
        if n in seen:
            continue
        seen.add(n)
        order.append(n)
        stack.extend(adj.get(n, []))
    affected = [o for o in order if o != start]
    expl = complete(f"Explain impact of changing {req_code} on {len(affected)} artifacts: {affected[:10]}")
    return {"requirement": req_code, "affected": affected,
            "explanation": expl["text"][:800], "provider": expl["provider"]}
