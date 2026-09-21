"""PRD/stories/architecture/db/api/security/tasks/tests generation + retrieval."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import current_user, project_or_403
from app.models.db import (Requirement, Prd, UserStory, ArchitectureComponent, ArchitectureRelationship,
                           DatabaseEntity, DatabaseField, ApiEndpoint, SecurityRequirement,
                           ImplementationTask, TestCase, AgentRun, Document, DocumentChunk)
from app.agents.generators import (gen_prd, gen_stories, gen_architecture, gen_db, gen_apis,
                                   gen_security, gen_tasks, gen_tests)
from app.traceability.engine import add_link
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
    project_or_403(pid, db, user)
    prd = db.query(Prd).filter_by(project_id=pid).first()
    return prd.content if prd else {}


@router.post("/projects/{pid}/stories/generate")
def stories_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    reqs = db.query(Requirement).filter_by(project_id=pid).all()
    rd = [{"title": r.title, "type": r.type, "code": r.code} for r in reqs]
    stories = gen_stories(rd)
    for s in stories:
        if not db.query(UserStory).filter_by(project_id=pid, code=s["code"]).first():
            db.add(UserStory(project_id=pid, **s))
            add_link(db, pid, "requirement", s["requirement_code"], "story", s["code"], "implements")
    db.add(AgentRun(project_id=pid, agent="story", output_summary=f"{len(stories)} stories"))
    db.commit()
    return {"count": len(stories), "stories": stories}


@router.get("/projects/{pid}/stories")
def stories_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    return [{"code": s.code, "title": s.title, "story": s.story, "req": s.requirement_code}
            for s in db.query(UserStory).filter_by(project_id=pid).all()]


@router.post("/projects/{pid}/architecture/generate")
def arch_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
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
    project_or_403(pid, db, user)
    comps = db.query(ArchitectureComponent).filter_by(project_id=pid).all()
    rels = db.query(ArchitectureRelationship).filter_by(project_id=pid).all()
    return {"components": [{"name": c.name, "kind": c.kind, "description": c.description, "boundary": c.boundary} for c in comps],
            "relationships": [{"source": r.source, "target": r.target, "label": r.label} for r in rels]}


@router.post("/projects/{pid}/database/generate")
def db_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    p = project_or_403(pid, db, user)
    spec = gen_db(p.product_idea or p.name)
    for e in db.query(DatabaseEntity).filter_by(project_id=pid).all():
        db.query(DatabaseField).filter_by(entity_id=e.id).delete()
    db.query(DatabaseEntity).filter_by(project_id=pid).delete()
    for ent in spec["entities"]:
        row = DatabaseEntity(project_id=pid, name=ent["name"])
        db.add(row)
        db.flush()
        for f in ent["fields"]:
            is_pk, is_fk = "(pk)" in f, "(fk" in f
            db.add(DatabaseField(entity_id=row.id, name=f.split("(")[0].strip(),
                                 dtype="uuid" if is_pk else "text", is_pk=is_pk, is_fk=is_fk, references=f))
    db.add(AgentRun(project_id=pid, agent="database", output_summary=f"{len(spec['entities'])} entities"))
    db.commit()
    return spec


@router.post("/projects/{pid}/apis/generate")
def apis_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    p = project_or_403(pid, db, user)
    eps = gen_apis(p.product_idea or p.name)
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
    project_or_403(pid, db, user)
    return [{"code": a.code, "method": a.method, "path": a.path, "auth": a.auth}
            for a in db.query(ApiEndpoint).filter_by(project_id=pid).all()]


@router.post("/projects/{pid}/security/analyze")
def sec_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    secs = gen_security()
    db.query(SecurityRequirement).filter_by(project_id=pid).delete()
    for s in secs:
        db.add(SecurityRequirement(project_id=pid, **s))
    for s in secs:
        add_link(db, pid, "security", s["code"], "api", "API-001", "protects")
    db.add(AgentRun(project_id=pid, agent="security", output_summary=f"{len(secs)} controls"))
    db.commit()
    return {"count": len(secs), "controls": secs}


@router.post("/projects/{pid}/tasks/generate")
def tasks_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    reqs = [{"title": r.title, "type": r.type, "code": r.code, "priority": r.priority}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    tasks = gen_tasks(reqs)
    db.query(ImplementationTask).filter_by(project_id=pid).delete()
    for t in tasks:
        db.add(ImplementationTask(project_id=pid, **t))
        add_link(db, pid, "requirement", t["requirement_code"], "task", t["code"])
    db.commit()
    return {"count": len(tasks), "tasks": tasks}


@router.post("/projects/{pid}/tests/generate")
def tests_gen(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    reqs = [{"title": r.title, "type": r.type, "code": r.code, "acceptance_criteria": r.acceptance_criteria or ""}
            for r in db.query(Requirement).filter_by(project_id=pid).all()]
    tests = gen_tests(reqs)
    db.query(TestCase).filter_by(project_id=pid).delete()
    for t in tests:
        db.add(TestCase(project_id=pid, **t))
        add_link(db, pid, "requirement", t["requirement_code"], "test", t["code"], "validated-by")
    db.commit()
    return {"count": len(tests), "tests": tests}


@router.get("/projects/{pid}/tests")
def tests_list(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    project_or_403(pid, db, user)
    return [{"code": t.code, "title": t.title, "kind": t.kind, "req": t.requirement_code}
            for t in db.query(TestCase).filter_by(project_id=pid).all()]
