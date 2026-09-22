"""PRD/stories/architecture/db/api/security/tasks/tests generation + retrieval."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.audit import log
from app.api.deps import current_user, project_or_403
from app.models.db import (Requirement, Prd, UserStory, AcceptanceCriteria, ArchitectureComponent,
                           ArchitectureRelationship, DatabaseEntity, DatabaseField, ApiEndpoint,
                           SecurityRequirement, ImplementationTask, TestCase, AgentRun,
                           Document, DocumentChunk, TraceabilityLink)
from app.schemas import PrdUpdate, StatusPatch, ComponentIn
from app.agents.generators import (gen_prd, gen_stories, gen_architecture, gen_db, gen_apis,
                                   gen_security, gen_tasks, gen_tests)
from app.traceability.engine import add_link, clear_links
from app.rag.retriever import retrieve

router = APIRouter(tags=["blueprint"])


def _evidence(db: Session, pid: str, query: str) -> str:
    rows = db.query(DocumentChunk).join(Document, Document.id == DocumentChunk.document_id)\
        .filter(Document.project_id == pid).limit(200).all()
    chunks = [{"content": c.content, "section": c.section, "source": c.document_id} for c in rows]
    if not chunks:
        return ""
    hits = retrieve(chunks, query)
    return "\n".join(h.get("content", "")[:500] for h in hits)


@router.post("/projects/{pid}/prd/generate")
def prd_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate the PRD from approved requirements + RAG evidence (§6.4)."""
    p = project_or_403(pid, db, user)
    reqs = [{"title": r.title, "type": r.type, "code": r.code}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    ev = _evidence(db, pid, p.product_idea or "architecture standards")
    content = gen_prd(p.product_idea or p.name, reqs, ev)
    existing = db.query(Prd).filter_by(project_id=pid).first()
    if existing:
        existing.content = content
    else:
        db.add(Prd(project_id=pid, content=content))
    db.add(AgentRun(project_id=pid, agent="prd", output_summary="PRD generated",
                    evidence=[{"source": "rag", "used": bool(ev)}]))
    db.commit()
    return content


@router.get("/projects/{pid}/prd")
def prd_get(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Read the current PRD (content + approval status)."""
    project_or_403(pid, db, user)
    prd = db.query(Prd).filter_by(project_id=pid).first()
    if not prd:
        return {}
    return {"content": prd.content, "status": prd.status}


@router.put("/projects/{pid}/prd")
def prd_put(pid: str, body: PrdUpdate, db: Session = Depends(get_db), user=Depends(current_user)):
    """Edit the PRD (§6.4: the PRD remains editable) or mark it approved."""
    project_or_403(pid, db, user)
    prd = db.query(Prd).filter_by(project_id=pid).first()
    if not prd:
        raise HTTPException(404, "Generate the PRD first")
    if body.content is not None:
        prd.content = body.content
    if body.status is not None:
        prd.status = body.status
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="prd.update", detail=prd.status)
    return {"status": prd.status}


@router.post("/projects/{pid}/stories/generate")
def stories_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate user stories (+ acceptance criteria) from requirements (§7)."""
    project_or_403(pid, db, user)
    reqs = db.query(Requirement).filter_by(project_id=pid).all()
    rd = [{"title": r.title, "type": r.type, "code": r.code} for r in reqs]
    stories = gen_stories(rd)
    for s in stories:
        if not db.query(UserStory).filter_by(project_id=pid, code=s["code"]).first():
            row = UserStory(project_id=pid, code=s["code"], title=s["title"],
                            story=s["story"], requirement_code=s["requirement_code"], status=s["status"])
            db.add(row)
            db.flush()
            for ac in s.get("acceptance", []):
                db.add(AcceptanceCriteria(project_id=pid, story_id=row.id, text=ac))
            add_link(db, pid, "requirement", s["requirement_code"], "story", s["code"], "implements")
    db.add(AgentRun(project_id=pid, agent="story", output_summary=f"{len(stories)} stories"))
    db.commit()
    return {"count": len(stories), "stories": stories}


@router.get("/projects/{pid}/stories")
def stories_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """List user stories with their acceptance criteria."""
    project_or_403(pid, db, user)
    out = []
    for s in db.query(UserStory).filter_by(project_id=pid).all():
        ac = [a.text for a in db.query(AcceptanceCriteria).filter_by(story_id=s.id).all()]
        out.append({"code": s.code, "title": s.title, "story": s.story,
                    "req": s.requirement_code, "acceptance": ac, "status": s.status})
    return out


@router.post("/projects/{pid}/architecture/generate")
def arch_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate the system architecture from requirements + RAG evidence (§8)."""
    p = project_or_403(pid, db, user)
    reqs = [{"title": r.title, "type": r.type, "code": r.code} for r in db.query(Requirement).filter_by(project_id=pid).all()]
    ev = _evidence(db, pid, "architecture deployment auth boundaries")
    arch = gen_architecture(p.product_idea or p.name, reqs, ev)
    db.query(ArchitectureRelationship).filter_by(project_id=pid).delete()
    db.query(ArchitectureComponent).filter_by(project_id=pid).delete()
    for c in arch["components"]:
        db.add(ArchitectureComponent(project_id=pid, **c))
    for r in arch["relationships"]:
        db.add(ArchitectureRelationship(project_id=pid, **r))
    db.add(AgentRun(project_id=pid, agent="architecture", output_summary=f"{len(arch['components'])} components",
                    evidence=[{"rag": bool(ev)}]))
    db.commit()
    return arch


@router.get("/projects/{pid}/architecture")
def arch_get(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Read components + relationships for visualization (§31)."""
    project_or_403(pid, db, user)
    comps = db.query(ArchitectureComponent).filter_by(project_id=pid).all()
    rels = db.query(ArchitectureRelationship).filter_by(project_id=pid).all()
    return {"components": [{"id": c.id, "name": c.name, "kind": c.kind, "description": c.description, "boundary": c.boundary} for c in comps],
            "relationships": [{"source": r.source, "target": r.target, "label": r.label} for r in rels]}


@router.post("/projects/{pid}/architecture/components")
def arch_add(pid: str, body: ComponentIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Add a component by hand (architecture editor, §Phase 6)."""
    project_or_403(pid, db, user)
    c = ArchitectureComponent(project_id=pid, name=body.name, kind=body.kind,
                              description=body.description, boundary=body.boundary)
    db.add(c)
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="architecture.add", detail=c.name)
    return {"id": c.id, "name": c.name}


@router.delete("/projects/{pid}/architecture/components/{cid}")
def arch_del(pid: str, cid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Remove a hand-added (or generated) component."""
    project_or_403(pid, db, user)
    c = db.query(ArchitectureComponent).filter_by(id=cid, project_id=pid).first()
    if not c:
        raise HTTPException(404, "Component not found")
    name = c.name
    db.delete(c)
    db.commit()
    log(db, project_id=pid, user_id=user.id, action="architecture.delete", detail=name)
    return {"deleted": name}


@router.post("/projects/{pid}/database/generate")
def db_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate the database design with stable DB-xxx codes (§9)."""
    p = project_or_403(pid, db, user)
    spec = gen_db(p.product_idea or p.name)
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
    db.add(AgentRun(project_id=pid, agent="database", output_summary=f"{len(spec['entities'])} entities"))
    db.commit()
    return spec


@router.get("/projects/{pid}/database")
def db_get(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Read entities + fields (keys, references, nullability)."""
    project_or_403(pid, db, user)
    out = []
    for e in db.query(DatabaseEntity).filter_by(project_id=pid).all():
        fields = db.query(DatabaseField).filter_by(entity_id=e.id).all()
        out.append({"code": e.code, "name": e.name,
                    "fields": [{"name": f.name, "dtype": f.dtype, "pk": f.is_pk,
                                "fk": f.is_fk, "references": f.references, "nullable": f.nullable}
                               for f in fields]})
    return {"entities": out}


@router.post("/projects/{pid}/apis/generate")
def apis_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate API endpoints + auto-link functional requirements (§10)."""
    p = project_or_403(pid, db, user)
    eps = gen_apis(p.product_idea or p.name)
    clear_links(db, pid, source_type="requirement", target_types=("api",))
    db.query(ApiEndpoint).filter_by(project_id=pid).delete()
    for e in eps:
        db.add(ApiEndpoint(project_id=pid, **e))
    # auto traceability: link functional REQs -> APIs round-robin
    reqs = db.query(Requirement).filter_by(project_id=pid).all()
    for i, r in enumerate([x for x in reqs if x.type == "functional"]):
        api = eps[i % len(eps)]
        add_link(db, pid, "requirement", r.code, "api", api["code"])
    db.add(AgentRun(project_id=pid, agent="api", output_summary=f"{len(eps)} endpoints"))
    db.commit()
    return {"count": len(eps), "endpoints": eps}


@router.get("/projects/{pid}/apis")
def apis_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """List endpoints with method, path, auth and schemas."""
    project_or_403(pid, db, user)
    return [{"code": a.code, "method": a.method, "path": a.path, "auth": a.auth,
             "request_schema": a.request_schema, "response_schema": a.response_schema,
             "status_codes": a.status_codes}
            for a in db.query(ApiEndpoint).filter_by(project_id=pid).all()]


@router.post("/projects/{pid}/security/analyze")
def sec_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate security controls traceable to real APIs (§11)."""
    project_or_403(pid, db, user)
    secs = gen_security()
    db.query(SecurityRequirement).filter_by(project_id=pid).delete()
    for s in secs:
        db.add(SecurityRequirement(project_id=pid, **s))
    first_api = db.query(ApiEndpoint).filter_by(project_id=pid).first()
    if first_api:  # never link to an endpoint that does not exist
        for s in secs:
            add_link(db, pid, "security", s["code"], "api", first_api.code or first_api.path, "protects")
    db.add(AgentRun(project_id=pid, agent="security", output_summary=f"{len(secs)} controls"))
    db.commit()
    return {"count": len(secs), "controls": secs}


@router.get("/projects/{pid}/security")
def sec_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """List security controls with scope."""
    project_or_403(pid, db, user)
    return [{"code": s.code, "title": s.title, "description": s.description, "scope": s.scope}
            for s in db.query(SecurityRequirement).filter_by(project_id=pid).all()]


@router.post("/projects/{pid}/tasks/generate")
def tasks_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate implementation tasks linked to requirements (§12)."""
    project_or_403(pid, db, user)
    reqs = [{"title": r.title, "type": r.type, "code": r.code, "priority": r.priority}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    tasks = gen_tasks(reqs)
    clear_links(db, pid, source_type="requirement", target_types=("task",))
    db.query(ImplementationTask).filter_by(project_id=pid).delete()
    for t in tasks:
        db.add(ImplementationTask(project_id=pid, **t))
        add_link(db, pid, "requirement", t["requirement_code"], "task", t["code"])
    db.commit()
    return {"count": len(tasks), "tasks": tasks}


@router.get("/projects/{pid}/tasks")
def tasks_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """List tasks grouped client-side by epic."""
    project_or_403(pid, db, user)
    return [{"id": t.id, "code": t.code, "epic": t.epic, "title": t.title,
             "req": t.requirement_code, "priority": t.priority, "status": t.status}
            for t in db.query(ImplementationTask).filter_by(project_id=pid).all()]


@router.patch("/projects/{pid}/tasks/{tid}")
def task_status(pid: str, tid: str, body: StatusPatch, db: Session = Depends(get_db), user=Depends(current_user)):
    """Advance a task (todo -> doing -> done)."""
    project_or_403(pid, db, user)
    t = db.query(ImplementationTask).filter_by(id=tid, project_id=pid).first()
    if not t:
        raise HTTPException(404, "Task not found")
    if body.status not in ("todo", "doing", "done"):
        raise HTTPException(400, "status must be todo|doing|done")
    t.status = body.status
    db.commit()
    return {"code": t.code, "status": t.status}


@router.post("/projects/{pid}/tests/generate")
def tests_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Generate test cases linked to requirements (§13)."""
    project_or_403(pid, db, user)
    reqs = [{"title": r.title, "type": r.type, "code": r.code, "acceptance_criteria": r.acceptance_criteria or ""}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    tests = gen_tests(reqs)
    clear_links(db, pid, source_type="requirement", target_types=("test",))
    db.query(TestCase).filter_by(project_id=pid).delete()
    for t in tests:
        db.add(TestCase(project_id=pid, **t))
        add_link(db, pid, "requirement", t["requirement_code"], "test", t["code"], "validated-by")
    db.commit()
    return {"count": len(tests), "tests": tests}


@router.get("/projects/{pid}/tests")
def tests_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """List test cases with kind and source requirement."""
    project_or_403(pid, db, user)
    return [{"code": t.code, "title": t.title, "kind": t.kind, "req": t.requirement_code,
             "steps": t.steps, "expected": t.expected}
            for t in db.query(TestCase).filter_by(project_id=pid).all()]


@router.get("/projects/{pid}/runs")
def runs_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Agent execution history (§6.1: every AI action is recorded)."""
    project_or_403(pid, db, user)
    rows = db.query(AgentRun).filter_by(project_id=pid).order_by(AgentRun.created_at.desc()).limit(100).all()
    return [{"agent": r.agent, "stage": r.stage, "output": r.output_summary,
             "latency_ms": r.latency_ms, "tokens": r.tokens, "status": r.status,
             "at": r.created_at.isoformat() if r.created_at else ""} for r in rows]
