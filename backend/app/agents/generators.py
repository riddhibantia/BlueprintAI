"""Deterministic domain generators (mock agents). Real LLM enriches text; structure is always deterministic."""
import re
from app.agents.base import complete


def clarify_questions(idea: str) -> list[str]:
    base = [
        "Who are the primary users and roles?",
        "What authentication method is required?",
        "What are the core entities and workflows?",
        "Any compliance, data-residency, or security constraints?",
        "What integrations / external systems are needed?",
    ]
    low = idea.lower()
    extra = []
    if "expense" in low or "payment" in low:
        extra = ["Who approves? Are receipts required? Expense categories?"]
    if "school" in low or "student" in low:
        extra = ["Student/teacher/admin roles? Grading workflow?"]
    return base + extra


def gen_requirements(idea: str, answers: str = "", evidence: str = "") -> list[dict]:
    llm = complete(f"Draft requirements for: {idea}. Clarifications: {answers}", evidence)
    core = [
        ("User registration and login with JWT", "functional", "high"),
        ("Role-based access control (admin/manager/user)", "security", "high"),
        ("CRUD for core domain entities", "functional", "high"),
        ("Audit logging for sensitive actions", "non-functional", "medium"),
        ("Input validation on all API endpoints", "security", "high"),
        ("Response time p95 < 500ms for reads", "non-functional", "medium"),
        ("Encrypted secrets management", "constraint", "high"),
        ("Approval workflow with states", "business-rule", "medium"),
    ]
    out = []
    for i, (t, typ, pri) in enumerate(core, 1):
        out.append({"code": f"REQ-{i:03d}", "title": t, "description": f"{t}. Context: {idea[:120]}",
                    "type": typ, "priority": pri,
                    "acceptance_criteria": f"{t} verified by test; {llm['text'][:80]}",
                    "status": "draft"})
    return out


def gen_prd(idea: str, reqs: list[dict], evidence: str = "") -> dict:
    llm = complete(f"PRD outline for {idea} with {len(reqs)} requirements", evidence)
    return {
        "problem": f"Teams building '{idea}' lack connected blueprints.",
        "goals": ["Traceable requirements", "Consistent architecture/APIs/DB", "Validated delivery"],
        "users": ["developers", "PMs", "architects"],
        "functional": [r["title"] for r in reqs if r["type"] == "functional"],
        "non_functional": [r["title"] for r in reqs if r["type"] != "functional"],
        "constraints": ["No Docker locally", "Postgres+pgvector", "Human approval required"],
        "metrics": ["Traceability coverage %", "Consistency issues", "Test coverage %"],
        "assumptions": [llm["text"][:200]],
        "acceptance": ["All major REQs have linked tests"],
    }


def gen_stories(reqs: list[dict]) -> list[dict]:
    out = []
    for i, r in enumerate([x for x in reqs if x["type"] in ("functional", "business-rule")][:15], 1):
        out.append({"code": f"US-{i:03d}", "title": r["title"],
                    "story": f"As a user, I want {r['title'].lower()}, so that the goal is achieved.",
                    "requirement_code": r["code"], "status": "draft"})
    return out


def gen_architecture(idea: str, reqs: list[dict], evidence: str = "") -> dict:
    complete(f"Architecture for {idea}", evidence)
    comps = [
        {"name": "Web Frontend (Next.js)", "kind": "frontend", "description": "UI workspace", "boundary": "public"},
        {"name": "API Layer (FastAPI)", "kind": "api", "description": "REST/JSON", "boundary": "auth:jwt"},
        {"name": "App Services", "kind": "service", "description": "domain logic", "boundary": "private"},
        {"name": "PostgreSQL + pgvector", "kind": "database", "description": "state + vectors", "boundary": "private"},
        {"name": "Object Storage (S3)", "kind": "external", "description": "receipts/docs", "boundary": "private"},
    ]
    rels = [
        {"source": "Web Frontend (Next.js)", "target": "API Layer (FastAPI)", "label": "REST/JSON"},
        {"source": "API Layer (FastAPI)", "target": "App Services", "label": "calls"},
        {"source": "App Services", "target": "PostgreSQL + pgvector", "label": "reads/writes"},
        {"source": "App Services", "target": "Object Storage (S3)", "label": "blob store"},
    ]
    return {"components": comps, "relationships": rels}


def gen_db(idea: str) -> dict:
    low = idea.lower()
    if "expense" in low:
        ents = {"User": ["user_id(pk)", "name", "email", "role"],
                "Expense": ["expense_id(pk)", "employee_id(fk→User)", "amount", "category", "status"],
                "Approval": ["approval_id(pk)", "expense_id(fk→Expense)", "approver_id(fk→User)", "status"]}
    else:
        ents = {"User": ["user_id(pk)", "name", "email", "role"],
                "ProjectItem": ["item_id(pk)", "owner_id(fk→User)", "title", "status"],
                "AuditEvent": ["event_id(pk)", "actor_id(fk→User)", "action", "created_at"]}
    return {"entities": [{"name": k, "fields": v} for k, v in ents.items()]}


def gen_apis(idea: str) -> list[dict]:
    low = idea.lower()
    if "expense" in low:
        eps = [("POST", "/expenses"), ("GET", "/expenses"), ("GET", "/expenses/{id}"),
               ("POST", "/expenses/{id}/approve"), ("POST", "/expenses/{id}/reject")]
    else:
        eps = [("POST", "/items"), ("GET", "/items"), ("GET", "/items/{id}"),
               ("PUT", "/items/{id}"), ("DELETE", "/items/{id}")]
    return [{"code": f"API-{i:03d}", "method": m, "path": p, "auth": "jwt",
             "request_schema": {}, "response_schema": {}, "status_codes": [200, 400, 401, 404]}
            for i, (m, p) in enumerate(eps, 1)]


def gen_security() -> list[dict]:
    items = [("JWT authentication", "All API calls require Bearer JWT"),
             ("RBAC enforcement", "Manager/admin-only approve paths"),
             ("Input validation", "Pydantic schemas on all writes"),
             ("Secrets management", "No secrets in git; env/vault only"),
             ("Upload validation", "Type/size checks, isolated storage")]
    return [{"code": f"SEC-{i:03d}", "title": t, "description": d, "scope": "api"}
            for i, (t, d) in enumerate(items, 1)]


def gen_tasks(reqs: list[dict]) -> list[dict]:
    out = []
    for i, r in enumerate(reqs[:12], 1):
        out.append({"code": f"TASK-{i:03d}", "epic": "MVP", "title": f"Implement: {r['title']}",
                    "requirement_code": r["code"], "priority": r.get("priority", "medium"), "status": "todo"})
    return out


def gen_tests(reqs: list[dict]) -> list[dict]:
    out = []
    for i, r in enumerate(reqs[:12], 1):
        kind = "security" if r["type"] == "security" else "acceptance"
        out.append({"code": f"TEST-{i:03d}", "title": f"Validate: {r['title']}", "kind": kind,
                    "requirement_code": r["code"], "steps": "1. Setup 2. Act 3. Assert",
                    "expected": r.get("acceptance_criteria", "Pass")})
    return out
