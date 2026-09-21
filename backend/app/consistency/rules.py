"""Deterministic consistency checks (§15). Returns issues; LLM only explains."""
from sqlalchemy.orm import Session
from app.models.db import (Requirement, ApiEndpoint, DatabaseEntity, DatabaseField,
                           SecurityRequirement, TestCase, ArchitectureComponent)


def run_checks(db: Session, project_id: str) -> list[dict]:
    issues = []
    reqs = db.query(Requirement).filter_by(project_id=project_id).all()
    apis = db.query(ApiEndpoint).filter_by(project_id=project_id).all()
    tests = db.query(TestCase).filter_by(project_id=project_id).all()
    secs = db.query(SecurityRequirement).filter_by(project_id=project_id).all()
    comps = db.query(ArchitectureComponent).filter_by(project_id=project_id).all()
    ents = db.query(DatabaseEntity).filter_by(project_id=project_id).all()

    api_paths = " ".join(a.path for a in apis).lower()
    # REQ -> API
    for r in reqs:
        if r.type == "functional" and r.status == "approved":
            keywords = [w for w in r.title.lower().split() if len(w) > 3][:3]
            if keywords and not any(k in api_paths for k in keywords) and len(apis) > 0:
                issues.append({"check": "req-api", "severity": "warning",
                               "description": f"{r.code} '{r.title}' has no obvious API match",
                               "affected": [r.code], "suggestion": "Add endpoint or link existing API"})
    # REQ -> TEST
    tested = {t.requirement_code for t in tests}
    for r in reqs:
        if r.code not in tested and r.status == "approved":
            issues.append({"check": "req-test", "severity": "warning",
                           "description": f"{r.code} has no linked test",
                           "affected": [r.code], "suggestion": f"Generate TEST for {r.code}"})
    # SEC -> API
    if secs and apis:
        unprotected = [a for a in apis if (a.auth or "").lower() in ("", "none")]
        if unprotected:
            issues.append({"check": "sec-api", "severity": "conflict",
                           "description": f"{len(unprotected)} endpoint(s) without auth",
                           "affected": [a.code or a.path for a in unprotected],
                           "suggestion": "Enforce JWT + RBAC"})
    # API -> DB (path mentions entity?)
    if apis and ents:
        names = [e.name.lower() for e in ents]
        for a in apis:
            pl = a.path.lower()
            if "expense" in pl and "expense" not in names:
                issues.append({"check": "api-db", "severity": "warning",
                               "description": f"{a.code or a.path} references missing Expense entity",
                               "affected": [a.code or a.path], "suggestion": "Add Expense entity/fields"})
                break
    # S3 vs binary receipt heuristic (§16 example)
    for e in ents:
        fields = db.query(DatabaseField).filter_by(entity_id=e.id).all()
        for f in fields:
            if "receipt" in f.name.lower() and "bin" in (f.dtype or "").lower():
                issues.append({"check": "prd-db", "severity": "conflict",
                               "description": "Receipt binary stored in DB; PRD/architecture specify S3",
                               "affected": [e.name, f.name], "suggestion": "Store S3 key in DB, binary in S3"})
    if not comps and reqs:
        issues.append({"check": "req-arch", "severity": "info",
                       "description": "No architecture components yet", "affected": [],
                       "suggestion": "Generate architecture"})
    return issues
