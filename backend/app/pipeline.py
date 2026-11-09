"""Full auto-pipeline: PRD → stories → architecture → DB → APIs → security → tasks → tests.

Runs server-side in dependency order after requirements are approved, so the
user lands on finished artifacts instead of clicking eight generate buttons.
Mirrors the per-stage route logic (same generators, same linking); the routes
stay the authoritative per-stage API. Deterministic under the mock LLM.

The stage functions below are the single source of truth: `run_full_pipeline`
executes them sequentially, and `stream_pipeline_events` executes the same
functions inside the SSE loop so streamed progress reflects real work.
"""
import json
import time

from sqlalchemy.orm import Session

from app.models.db import (Requirement, Prd,
                           ArchitectureComponent, ArchitectureRelationship,
                           DatabaseEntity, DatabaseField, ApiEndpoint,
                           SecurityRequirement, ImplementationTask, TestCase,
                           AgentRun)
from app.agents.generators import (gen_prd, gen_stories, gen_architecture, gen_db,
                                   gen_apis, gen_security, gen_tasks, gen_tests, parse_db_field)
from app.agents.store import sync_stories
from app.traceability.engine import add_link, clear_links
from app.rag.context import evidence as rag_evidence

_evidence = rag_evidence


def _timed(stages: dict, name: str, fn):
    t0 = time.time()
    out = fn()
    stages[name] = {**out, "latency_ms": int((time.time() - t0) * 1000)}
    return out


def _idea_of(db: Session, pid: str) -> str:
    from app.models.db import Project
    p = db.query(Project).filter_by(id=pid).first()
    return (p.product_idea or p.name) if p else "project"


# --- Per-stage generators + persistence (shared by batch and streaming runs) ---

def stage_prd(db: Session, pid: str, idea: str) -> dict:
    reqs = [{"title": r.title, "type": r.type, "code": r.code, "status": r.status}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    content = gen_prd(idea, reqs, rag_evidence(db, pid, idea))
    existing = db.query(Prd).filter_by(project_id=pid).first()
    if existing:
        existing.content = content
    else:
        db.add(Prd(project_id=pid, content=content))
    db.add(AgentRun(project_id=pid, agent="prd", output_summary="PRD generated"))
    db.commit()
    return {"sections": len(content)}


def stage_stories(db: Session, pid: str, idea: str) -> dict:
    rd = [{"title": r.title, "type": r.type, "code": r.code}
          for r in db.query(Requirement).filter_by(project_id=pid).all()]
    stories = gen_stories(rd)
    counts = sync_stories(db, pid, stories)
    db.add(AgentRun(project_id=pid, agent="story", output_summary=f"{len(stories)} stories"))
    db.commit()
    return {"count": len(stories), **counts}


def stage_architecture(db: Session, pid: str, idea: str) -> dict:
    rd = [{"title": r.title, "type": r.type, "code": r.code}
          for r in db.query(Requirement).filter_by(project_id=pid).all()]
    arch = gen_architecture(idea, rd, rag_evidence(db, pid, "architecture deployment auth boundaries"))
    db.query(ArchitectureRelationship).filter_by(project_id=pid).delete()
    db.query(ArchitectureComponent).filter_by(project_id=pid).delete()
    for c in arch["components"]:
        db.add(ArchitectureComponent(project_id=pid, **c))
    for r in arch["relationships"]:
        db.add(ArchitectureRelationship(project_id=pid, **r))
    db.add(AgentRun(project_id=pid, agent="architecture",
                    output_summary=f"{len(arch['components'])} components"))
    db.commit()
    return {"components": len(arch["components"]), "relationships": len(arch["relationships"])}


def stage_database(db: Session, pid: str, idea: str) -> dict:
    spec = gen_db(idea, evidence=_evidence(db, pid, "database entities tables schema models data fields"))
    for e in db.query(DatabaseEntity).filter_by(project_id=pid).all():
        db.query(DatabaseField).filter_by(entity_id=e.id).delete()
    db.query(DatabaseEntity).filter_by(project_id=pid).delete()
    for i, ent in enumerate(spec["entities"], 1):
        row = DatabaseEntity(project_id=pid, code=f"DB-{i:03d}", name=ent["name"])
        db.add(row)
        db.flush()
        for f in ent["fields"]:
            db.add(DatabaseField(entity_id=row.id, **parse_db_field(f)))
    db.add(AgentRun(project_id=pid, agent="database",
                    output_summary=f"{len(spec['entities'])} entities"))
    db.commit()
    return {"entities": len(spec["entities"])}


def stage_apis(db: Session, pid: str, idea: str) -> dict:
    eps = gen_apis(idea, evidence=_evidence(db, pid, "api endpoints routes http methods rest request response"))
    clear_links(db, pid, source_type="requirement", target_types=("api",))
    db.query(ApiEndpoint).filter_by(project_id=pid).delete()
    for e in eps:
        db.add(ApiEndpoint(project_id=pid, **e))
    db.flush()
    from app.traceability.engine import earned_links
    for lk in earned_links(db, pid):
        add_link(db, pid, lk["source_type"], lk["source_id"], lk["target_type"],
                 lk["target_id"], lk["relationship_type"])
    db.add(AgentRun(project_id=pid, agent="api", output_summary=f"{len(eps)} endpoints"))
    db.commit()
    return {"count": len(eps)}


def stage_security(db: Session, pid: str, idea: str) -> dict:
    secs = gen_security(evidence=_evidence(db, pid, "security auth rbac jwt encryption compliance owasp"))
    clear_links(db, pid, source_type="security", target_types=("api",))
    db.query(SecurityRequirement).filter_by(project_id=pid).delete()
    for s in secs:
        db.add(SecurityRequirement(project_id=pid, **s))
    db.flush()
    from app.traceability.engine import earned_security_links
    for lk in earned_security_links(db, pid):
        add_link(db, pid, lk["source_type"], lk["source_id"], lk["target_type"],
                 lk["target_id"], lk["relationship_type"])
    db.add(AgentRun(project_id=pid, agent="security",
                    output_summary=f"{len(secs)} controls"))
    db.commit()
    return {"count": len(secs)}


def stage_tasks(db: Session, pid: str, idea: str) -> dict:
    reqs = [{"title": r.title, "type": r.type, "code": r.code, "priority": r.priority}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    tasks = gen_tasks(reqs, evidence=_evidence(db, pid, "implementation sprint tasks milestone mvp"))
    clear_links(db, pid, source_type="requirement", target_types=("task",))
    db.query(ImplementationTask).filter_by(project_id=pid).delete()
    for t in tasks:
        db.add(ImplementationTask(project_id=pid, **t))
        add_link(db, pid, "requirement", t["requirement_code"], "task", t["code"])
    db.commit()
    return {"count": len(tasks)}


def stage_tests(db: Session, pid: str, idea: str) -> dict:
    reqs = [{"title": r.title, "type": r.type, "code": r.code,
             "acceptance_criteria": r.acceptance_criteria or ""}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    tests = gen_tests(reqs, evidence=_evidence(db, pid, "testing unit integration acceptance edge cases"))
    clear_links(db, pid, source_type="requirement", target_types=("test",))
    db.query(TestCase).filter_by(project_id=pid).delete()
    for t in tests:
        db.add(TestCase(project_id=pid, **t))
        add_link(db, pid, "requirement", t["requirement_code"], "test", t["code"], "validated-by")
    db.commit()
    return {"count": len(tests)}


STAGES: list[tuple[str, str, callable]] = [
    ("prd", "Product Requirements Document", stage_prd),
    ("stories", "User Stories", stage_stories),
    ("architecture", "Architecture & Boundaries", stage_architecture),
    ("database", "Data Model & Schema", stage_database),
    ("apis", "REST API Surface", stage_apis),
    ("security", "Security Controls", stage_security),
    ("tasks", "Implementation Tasks", stage_tasks),
    ("tests", "Validation & Tests", stage_tests),
]


def run_full_pipeline(db: Session, pid: str, user_id: str = "") -> dict:
    """Generate every downstream artifact for approved requirements. Idempotent
    per stage (regeneration replaces that stage's rows, never duplicates)."""
    from app.core.audit import log

    idea = _idea_of(db, pid)
    stages: dict = {}
    t_all = time.time()

    for key, _label, fn in STAGES:
        _timed(stages, key, lambda fn=fn: fn(db, pid, idea))

    from app.traceability.engine import coverage
    cov = coverage(db, pid)
    log(db, project_id=pid, user_id=user_id, action="pipeline.run",
        detail=f"8 stages, coverage {cov['coverage_pct']}%")
    return {"stages": stages,
            "total_latency_ms": int((time.time() - t_all) * 1000),
            "coverage_pct": cov["coverage_pct"], "orphans": cov["orphans"]}


def stream_pipeline_events(db: Session, pid: str, user_id: str = ""):
    """Yield SSE event JSON strings as each stage actually completes.

    Each stage's real generator + persistence runs inside the loop — the
    `stage_done` event fires only after that stage's rows are committed.
    """
    from app.core.audit import log

    idea = _idea_of(db, pid)
    t_all = time.time()
    yield f"data: {json.dumps({'event': 'start', 'message': 'Starting auto-pipeline', 'project': idea})}\n\n"

    total_stages = len(STAGES)
    stage_results: dict = {}
    for idx, (stage_key, stage_label, fn) in enumerate(STAGES, 1):
        yield f"data: {json.dumps({'event': 'stage_start', 'stage': stage_key, 'label': stage_label, 'index': idx, 'total': total_stages})}\n\n"
        t0 = time.time()
        out = fn(db, pid, idea)
        stage_results[stage_key] = {**out, "latency_ms": int((time.time() - t0) * 1000)}
        yield f"data: {json.dumps({'event': 'stage_done', 'stage': stage_key, 'label': stage_label, 'progress': int((idx / total_stages) * 100)})}\n\n"

    from app.traceability.engine import coverage
    cov = coverage(db, pid)
    log(db, project_id=pid, user_id=user_id, action="pipeline.run",
        detail=f"8 stages (streamed), coverage {cov['coverage_pct']}%")
    yield f"data: {json.dumps({'event': 'complete', 'coverage_pct': cov['coverage_pct'], 'latency_ms': int((time.time() - t_all) * 1000), 'stages': stage_results, 'orphans': cov['orphans']})}\n\n"
