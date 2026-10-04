"""Full auto-pipeline: PRD → stories → architecture → DB → APIs → security → tasks → tests.

Runs server-side in dependency order after requirements are approved, so the
user lands on finished artifacts instead of clicking eight generate buttons.
Mirrors the per-stage route logic (same generators, same linking); the routes
stay the authoritative per-stage API. Deterministic under the mock LLM.
"""
import time

from sqlalchemy.orm import Session

from app.models.db import (Requirement, Prd, UserStory, AcceptanceCriteria,
                           ArchitectureComponent, ArchitectureRelationship,
                           DatabaseEntity, DatabaseField, ApiEndpoint,
                           SecurityRequirement, ImplementationTask, TestCase,
                           AgentRun, Document, DocumentChunk)
from app.agents.generators import (gen_prd, gen_stories, gen_architecture, gen_db,
                                   gen_apis, gen_security, gen_tasks, gen_tests)
from app.traceability.engine import add_link, clear_links
from app.rag.retriever import retrieve


def _evidence(db: Session, pid: str, query: str) -> str:
    rows = db.query(DocumentChunk).join(Document, Document.id == DocumentChunk.document_id)\
        .filter(Document.project_id == pid).limit(200).all()
    chunks = [{"content": c.content, "section": c.section, "source": c.document_id,
               "embedding": c.embedding} for c in rows]
    if not chunks:
        return ""
    return "\n".join(h.get("content", "")[:500] for h in retrieve(chunks, query))


def _timed(stages: dict, name: str, fn):
    t0 = time.time()
    out = fn()
    stages[name] = {**out, "latency_ms": int((time.time() - t0) * 1000)}
    return out


def run_full_pipeline(db: Session, pid: str, user_id: str = "") -> dict:
    """Generate every downstream artifact for approved requirements. Idempotent
    per stage (regeneration replaces that stage's rows, never duplicates)."""
    from app.core.audit import log
    from app.models.db import Project

    p = db.query(Project).filter_by(id=pid).first()
    idea = (p.product_idea or p.name) if p else "project"
    stages: dict = {}
    t_all = time.time()

    def s_prd():
        reqs = [{"title": r.title, "type": r.type, "code": r.code, "status": r.status}
                for r in db.query(Requirement).filter_by(project_id=pid).all()]
        content = gen_prd(idea, reqs, _evidence(db, pid, idea))
        existing = db.query(Prd).filter_by(project_id=pid).first()
        if existing:
            existing.content = content
        else:
            db.add(Prd(project_id=pid, content=content))
        db.add(AgentRun(project_id=pid, agent="prd", output_summary="PRD generated"))
        db.commit()
        return {"sections": len(content)}

    def s_stories():
        rd = [{"title": r.title, "type": r.type, "code": r.code}
              for r in db.query(Requirement).filter_by(project_id=pid).all()]
        stories = gen_stories(rd)
        for s in stories:
            if not db.query(UserStory).filter_by(project_id=pid, code=s["code"]).first():
                row = UserStory(project_id=pid, code=s["code"], title=s["title"],
                                story=s["story"], requirement_code=s["requirement_code"],
                                status=s["status"])
                db.add(row)
                db.flush()
                for ac in s.get("acceptance", []):
                    db.add(AcceptanceCriteria(project_id=pid, story_id=row.id, text=ac))
                add_link(db, pid, "requirement", s["requirement_code"], "story", s["code"], "implements")
        db.add(AgentRun(project_id=pid, agent="story", output_summary=f"{len(stories)} stories"))
        db.commit()
        return {"count": len(stories)}

    def s_arch():
        rd = [{"title": r.title, "type": r.type, "code": r.code}
              for r in db.query(Requirement).filter_by(project_id=pid).all()]
        arch = gen_architecture(idea, rd, _evidence(db, pid, "architecture deployment auth boundaries"))
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

    def s_db():
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
                                     dtype="uuid" if is_pk else "text",
                                     is_pk=is_pk, is_fk=is_fk, references=f))
        db.add(AgentRun(project_id=pid, agent="database",
                        output_summary=f"{len(spec['entities'])} entities"))
        db.commit()
        return {"entities": len(spec["entities"])}

    def s_apis():
        eps = gen_apis(idea)
        clear_links(db, pid, source_type="requirement", target_types=("api",))
        db.query(ApiEndpoint).filter_by(project_id=pid).delete()
        for e in eps:
            db.add(ApiEndpoint(project_id=pid, **e))
        reqs = db.query(Requirement).filter_by(project_id=pid).all()
        functional = [x for x in reqs if x.type == "functional"]
        if eps and functional:
            for i, r in enumerate(functional):
                add_link(db, pid, "requirement", r.code, "api", eps[i % len(eps)]["code"])
        db.add(AgentRun(project_id=pid, agent="api", output_summary=f"{len(eps)} endpoints"))
        db.commit()
        return {"count": len(eps)}

    def s_sec():
        secs = gen_security()
        db.query(SecurityRequirement).filter_by(project_id=pid).delete()
        for s in secs:
            db.add(SecurityRequirement(project_id=pid, **s))
        first_api = db.query(ApiEndpoint).filter_by(project_id=pid).first()
        if first_api:
            for s in secs:
                add_link(db, pid, "security", s["code"], "api",
                         first_api.code or first_api.path, "protects")
        db.add(AgentRun(project_id=pid, agent="security",
                        output_summary=f"{len(secs)} controls"))
        db.commit()
        return {"count": len(secs)}

    def s_tasks():
        reqs = [{"title": r.title, "type": r.type, "code": r.code, "priority": r.priority}
                for r in db.query(Requirement).filter_by(project_id=pid).all()]
        tasks = gen_tasks(reqs)
        clear_links(db, pid, source_type="requirement", target_types=("task",))
        db.query(ImplementationTask).filter_by(project_id=pid).delete()
        for t in tasks:
            db.add(ImplementationTask(project_id=pid, **t))
            add_link(db, pid, "requirement", t["requirement_code"], "task", t["code"])
        db.commit()
        return {"count": len(tasks)}

    def s_tests():
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
        return {"count": len(tests)}

    _timed(stages, "prd", s_prd)
    _timed(stages, "stories", s_stories)
    _timed(stages, "architecture", s_arch)
    _timed(stages, "database", s_db)
    _timed(stages, "apis", s_apis)
    _timed(stages, "security", s_sec)
    _timed(stages, "tasks", s_tasks)
    _timed(stages, "tests", s_tests)

    from app.traceability.engine import coverage
    cov = coverage(db, pid)
    log(db, project_id=pid, user_id=user_id, action="pipeline.run",
        detail=f"8 stages, coverage {cov['coverage_pct']}%")
    return {"stages": stages,
            "total_latency_ms": int((time.time() - t_all) * 1000),
            "coverage_pct": cov["coverage_pct"], "orphans": cov["orphans"]}
