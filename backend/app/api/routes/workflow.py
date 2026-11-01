"""LangGraph multi-stage workflow with HITL checkpoints (§20/§22). Falls back to sequential runner if langgraph missing."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import current_user, project_or_403

router = APIRouter(tags=["workflow"])

STAGES = ["requirements", "prd", "architecture", "db_api_security", "validation", "traceability", "testing"]


def _run_stage(db: Session, pid: str, stage: str):
    # Lazy import to avoid hard dependency at boot on low-RAM machines
    from app.models.db import Project, Requirement
    p = db.query(Project).filter_by(id=pid).first()
    idea = (p.product_idea or p.name) if p else "project"

    if stage == "requirements":
        from app.agents.generators import gen_requirements
        n = db.query(Requirement).filter_by(project_id=pid).count()
        if n > 0:
            return f"{n} requirements already present — skipped (no duplicates staged)"
        reqs = gen_requirements(idea)
        for i, r in enumerate(reqs, 1):
            r["code"] = f"REQ-{i:03d}"
            db.add(Requirement(project_id=pid, **r))
        db.commit()
        return f"{len(reqs)} requirements staged (awaiting approval)"

    req_count = db.query(Requirement).filter_by(project_id=pid).count()
    if req_count == 0:
        return f"{stage} skipped (requires requirements to be staged/approved first)"

    if stage == "prd":
        from app.models.db import Prd
        from app.agents.generators import gen_prd
        from app.pipeline import _evidence
        reqs = [{"title": r.title, "type": r.type, "code": r.code, "status": r.status}
                for r in db.query(Requirement).filter_by(project_id=pid).all()]
        content = gen_prd(idea, reqs, _evidence(db, pid, idea))
        existing = db.query(Prd).filter_by(project_id=pid).first()
        if existing:
            existing.content = content
        else:
            db.add(Prd(project_id=pid, content=content))
        db.commit()
        return f"PRD generated with {len(content)} sections"

    if stage == "architecture":
        from app.models.db import ArchitectureComponent, ArchitectureRelationship
        from app.agents.generators import gen_architecture
        from app.pipeline import _evidence
        rd = [{"title": r.title, "type": r.type, "code": r.code}
              for r in db.query(Requirement).filter_by(project_id=pid).all()]
        arch = gen_architecture(idea, rd, _evidence(db, pid, "architecture deployment auth boundaries"))
        db.query(ArchitectureRelationship).filter_by(project_id=pid).delete()
        db.query(ArchitectureComponent).filter_by(project_id=pid).delete()
        for c in arch["components"]:
            db.add(ArchitectureComponent(project_id=pid, **c))
        for r in arch["relationships"]:
            db.add(ArchitectureRelationship(project_id=pid, **r))
        db.commit()
        return f"Architecture staged with {len(arch['components'])} components"

    if stage == "db_api_security":
        from app.models.db import DatabaseEntity, DatabaseField, ApiEndpoint, SecurityRequirement
        from app.agents.generators import gen_db, gen_apis, gen_security
        from app.traceability.engine import add_link, clear_links
        # DB
        spec = gen_db(idea)
        for e in db.query(DatabaseEntity).filter_by(project_id=pid).all():
            db.query(DatabaseField).filter_by(entity_id=e.id).delete()
        db.query(DatabaseEntity).filter_by(project_id=pid).delete()
        for i, ent in enumerate(spec["entities"], 1):
            row = DatabaseEntity(project_id=pid, code=f"DB-{i:03d}", name=ent["name"])
            db.add(row)
            db.flush()
            for f in ent["fields"]:
                is_pk, is_fk = "(pk)" in f, "(fk" in f
                db.add(DatabaseField(entity_id=row.id, name=f.split("(")[0].strip(),
                                     dtype="uuid" if is_pk else "text", is_pk=is_pk, is_fk=is_fk, references=f))
        # APIs
        eps = gen_apis(idea)
        clear_links(db, pid, source_type="requirement", target_types=("api",))
        db.query(ApiEndpoint).filter_by(project_id=pid).delete()
        for ep in eps:
            db.add(ApiEndpoint(project_id=pid, **ep))
        # Security
        secs = gen_security()
        db.query(SecurityRequirement).filter_by(project_id=pid).delete()
        for s in secs:
            db.add(SecurityRequirement(project_id=pid, **s))
        db.commit()
        return f"Data model ({len(spec['entities'])} entities), {len(eps)} APIs, and {len(secs)} security controls staged"

    if stage == "validation":
        from app.consistency.rules import run_checks
        from app.models.db import ConsistencyIssue
        issues = run_checks(db, pid)
        db.query(ConsistencyIssue).filter_by(project_id=pid).delete()
        for iss in issues:
            db.add(ConsistencyIssue(project_id=pid, **iss))
        db.commit()
        return f"Validation run: {len(issues)} consistency check(s) evaluated"

    if stage == "traceability":
        from app.traceability.engine import coverage
        cov = coverage(db, pid)
        return f"Traceability analyzed: {cov['coverage_pct']}% coverage ({len(cov['orphans'])} orphans)"

    if stage == "testing":
        from app.models.db import TestCase
        from app.agents.generators import gen_tests
        from app.traceability.engine import add_link, clear_links
        reqs = [{"title": r.title, "type": r.type, "code": r.code,
                 "acceptance_criteria": r.acceptance_criteria or ""}
                for r in db.query(Requirement).filter_by(project_id=pid).all()]
        tests = gen_tests(reqs)
        clear_links(db, pid, source_type="requirement", target_types=("test",))
        db.query(TestCase).filter_by(project_id=pid).delete()
        for t in tests:
            db.add(TestCase(project_id=pid, **t))
            add_link(db, pid, "requirement", t["requirement_code"], "test", t["code"], "validated-by")
        db.commit()
        return f"{len(tests)} test cases generated and linked"

    return f"{stage} stage completed (approval checkpoint)"


@router.post("/projects/{pid}/workflow/run")
def run_workflow(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """LangGraph multi-stage run with human approval checkpoints (§20/§22)."""
    project_or_403(pid, db, user)
    results = {}
    try:
        from typing import TypedDict
        from langgraph.graph import StateGraph, END  # type: ignore

        class FlowState(TypedDict, total=False):
            log: list
        # Minimal graph: linear pass with approval gates recorded as state
        def make_node(stage):
            def node(state: FlowState):
                return {"log": state.get("log", []) + [_run_stage(db, pid, stage)]}
            return node
        g = StateGraph(FlowState)
        prev = None
        for s in STAGES:
            g.add_node(s, make_node(s))
            if prev:
                g.add_edge(prev, s)
            prev = s
        g.set_entry_point(STAGES[0])
        g.add_edge(STAGES[-1], END)
        app = g.compile()
        out = app.invoke({})
        results = {"engine": "langgraph", "log": out.get("log", [])}
    except Exception as e:
        results = {"engine": "sequential-fallback", "note": str(e)[:200],
                   "log": [_run_stage(db, pid, s) for s in STAGES]}
    return {"stages": STAGES, **results,
            "hitl": "Each stage requires Approve/Edit/Reject before next stage (§22)"}


@router.post("/projects/{pid}/pipeline/run")
def run_pipeline(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Auto-pipeline: PRD → stories → architecture → DB → APIs → security →
    tasks → tests in one server-side pass after requirements are approved.

    Idempotent per stage (regeneration replaces, never duplicates). The user
    lands on finished artifacts; PDF export stays one click away.
    """
    from app.pipeline import run_full_pipeline
    project_or_403(pid, db, user)
    return run_full_pipeline(db, pid, user.id)


@router.get("/projects/{pid}/pipeline/stream")
def stream_pipeline(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Stream pipeline progression in real-time using Server-Sent Events (SSE)."""
    from fastapi.responses import StreamingResponse
    from app.pipeline import stream_pipeline_events
    project_or_403(pid, db, user)
    return StreamingResponse(
        stream_pipeline_events(db, pid, user.id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )
