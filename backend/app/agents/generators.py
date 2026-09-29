"""Deterministic domain generators (mock agents). Real LLM enriches text; structure is always deterministic."""
import re
from app.agents.base import complete


def clarify_questions(idea: str) -> list[str]:
    """Questions that expose the idea's ambiguities (§6.2)."""
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
    """Draft typed requirements with acceptance criteria (§6.3).

    Idea-aware mock: significant words from the idea + the user's own
    description (answers) become the domain entities, so every project gets
    different requirements. Titles and criteria stay in plain language a
    non-technical approver can read. Same 8-slot type skeleton every time
    (2 functional, 3 security, 2 non-functional, 1 business-rule, 1
    constraint) so counts stay stable; content varies by idea.
    """
    complete(f"Draft requirements for: {idea}. Clarifications: {answers}", evidence)
    ents = _entities(idea, answers)
    e1, e1p = ents[0], _plural(ents[0])
    e2, e2p = (ents[1], _plural(ents[1])) if len(ents) > 1 else ("Submission", "Submissions")
    core = [
        ("Sign up and log in", "functional", "high",
         "Anyone can create an account and sign in securely. In plain terms: your users get "
         "their own login, and passwords are never stored as readable text.",
         "A new user can register and log in; a wrong password is rejected."),
        (f"Create and manage {e1p}", "functional", "high",
         f"Users can add, edit, and remove {e1p} — the core thing this product handles. "
         f"In plain terms: the {e1} list is fully under the user's control.",
         f"A user can create an {e1} and see it in their list; deleting removes it everywhere."),
        ("Roles: the right people see the right things", "security", "high",
         "Managers, staff, and customers each see only what their role allows. In plain terms: "
         "no peeking at other people's data.",
         "A customer cannot open manager-only pages; every denial is logged."),
        ("Activity log nobody can erase", "non-functional", "medium",
         "Every important action is written to a tamper-proof history. In plain terms: you can "
         "always answer 'who changed what, and when?'",
         "Sensitive actions appear in the log with actor and timestamp."),
        ("Block harmful input everywhere", "security", "high",
         "Every form and API rejects malicious or malformed input. In plain terms: typing "
         "something nasty into a field can never break or trick the app.",
         "Script payloads in inputs are neutralized; oversized uploads are refused."),
        ("Fast responses, even when busy", "non-functional", "medium",
         "Pages answer in under half a second for typical reads. In plain terms: the app "
         "never keeps users staring at a spinner.",
         "95% of reads complete in under 500ms under normal load."),
        ("Secrets locked away from code", "constraint", "high",
         "Passwords, keys, and tokens live in vaults or environment config — never in code, "
         "logs, or the repo. In plain terms: a leaked screenshot can't leak access.",
         "No secret appears in code, logs, or version history."),
        (f"Review and approve {e2p}", "business-rule", "medium",
         f"Important {e2p.lower()} go live only after a second pair of eyes. In plain terms: "
         f"nothing ships by accident — {e2p.lower()} move submitted → approved or rejected.",
         f"An {e2} cannot go live before approval; rejections record a reason."),
    ]
    return [{"code": f"REQ-{i:03d}", "title": t, "description": d, "type": typ,
             "priority": pri, "acceptance_criteria": ac, "status": "draft"}
            for i, (t, typ, pri, d, ac) in enumerate(core, 1)]


STOPWORDS = set(
    "a an the to for of and or with my our new your you we they it its this that "
    "app application platform system software tool service online site website portal "
    "management tracker tracking marketplace manager build builder create maker studio "
    "smart easy simple little aesthetic modern best top ultimate pro plus go get use used using "
    "employee employees user users customer customers manager managers admin admins staff "
    "teacher teachers student students member members people person team teams "
    "approve approves approved approve managing manage manages track tracks send sends "
    "receive receives email emails book books booking create creates delete deletes update updates"
    .split())

FALLBACK_ENTITIES = ["Record", "Request", "Item"]


def _plural(noun: str) -> str:
    if noun.endswith("ing"):
        return noun  # activities stay singular: Tutoring, Booking
    if noun.endswith("y") and noun[-2:-1] not in "aeiou":
        return noun[:-1] + "ies"
    if noun.endswith(("s", "x", "ch", "sh")):
        return noun + "es"
    return noun + "s"


def _singular(w: str) -> str:
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("s") and not w.endswith(("ss", "us", "is")):
        return w[:-1]
    return w


def _entities(idea: str, answers: str = "") -> list[str]:
    """Domain entities from the idea + the user's own words (deterministic)."""
    words = re.findall(r"[A-Za-z][A-Za-z\-]{2,}", f"{idea} {answers}")
    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        if w.isupper() and len(w) <= 4:
            continue  # acronyms (SMS, API, PDF) are tech terms, not entities
        key = _singular(w.lower()).strip("-")
        if not key or key in STOPWORDS or key in seen:
            continue
        seen.add(key)
        noun = "-".join(p.capitalize() for p in key.split("-"))
        if noun not in out:
            out.append(noun)
        if len(out) == 3:
            break
    for fb in FALLBACK_ENTITIES:
        if len(out) >= 3:
            break
        if fb not in out:
            out.append(fb)
    return out[:3]


def gen_prd(idea: str, reqs: list[dict], evidence: str = "") -> dict:
    """Assemble the structured PRD sections (§6.4).

    Every functional/non-functional bullet cites its REQ-ID so the document
    traces back to approved requirements instead of floating as prose.
    """
    llm = complete(f"PRD outline for {idea} with {len(reqs)} requirements", evidence)
    approved = [r for r in reqs if r.get("status") == "approved"] or reqs
    func = [f"[{r['code']}] {r['title']}" for r in approved if r["type"] == "functional"]
    nonf = [f"[{r['code']}] {r['title']}" for r in approved if r["type"] != "functional"]
    high = [f"[{r['code']}] {r['title']}" for r in approved if r.get("priority") in ("high", "critical")]
    short = (idea[:140] + "…") if len(idea) > 140 else idea
    return {
        "overview": (f"{short} — this PRD defines what gets built, for whom, and how "
                     f"success is measured. It covers {len(approved)} requirements "
                     f"({len(func)} functional, {len(nonf)} non-functional)."),
        "problem": f"Teams building '{short}' lack connected blueprints: requirements drift from "
                   "architecture, APIs diverge from the data model, and tests can't prove coverage.",
        "goals": ["Traceable requirements — every artifact links to a REQ-ID",
                  "Consistent architecture, APIs, and DB derived from the same spec",
                  "Validated delivery — tests prove each requirement before sign-off"],
        "non_goals": ["Replacing human approval — every stage needs explicit sign-off",
                      "Inventing metrics — coverage is computed from stored links, never estimated"],
        "personas": ["Product manager — defines scope, approves requirements and PRD",
                     "Architect — owns components, boundaries, and data model",
                     "Engineer — implements tasks, keeps tests green"],
        "scope_in": func[:12] or ["No functional requirements approved yet — approve REQs first"],
        "scope_out": ["Features without an approved requirement are explicitly out of scope for v1"],
        "non_functional": nonf[:12] or ["No non-functional requirements recorded"],
        "priority_focus": high[:6] or ["No high-priority requirements flagged"],
        "user_experience": ["One workspace per project: requirements → spec → design → validation",
                            "Every generate action is reversible; approvals are explicit and audited"],
        "success_metrics": ["Traceability coverage 100% (0 orphan requirements)",
                            "Consistency issues: 0 open at sign-off",
                            "Test coverage: every approved REQ has a linked, passing test"],
        "risks": ["Vague requirements generating generic artifacts — mitigate with Clarify answers",
                  "Scope creep mid-build — mitigate with optimistic locking + change impact review"],
        "milestones": ["M1 — requirements approved", "M2 — architecture + APIs signed off",
                       "M3 — all tasks done, tests green, 0 open issues"],
        "open_questions": ["Which requirements are v1 vs later? (mark priority critical/high)",
                           "External integrations and auth provider confirmed?"],
        "constraints": ["Human approval required at every stage", "SQLite locally, Postgres+pgvector in production"],
        "assumptions": [llm["text"][:200]],
        "acceptance": ["All approved REQs have linked tests", "Traceability 100% before release sign-off"],
    }


def gen_stories(reqs: list[dict]) -> list[dict]:
    """Draft user stories (with acceptance criteria) from functional requirements."""
    out = []
    for i, r in enumerate([x for x in reqs if x["type"] in ("functional", "business-rule")][:15], 1):
        title = r["title"]
        out.append({"code": f"US-{i:03d}", "title": title,
                    "story": f"As a user, I want {title.lower()}, so that the goal is achieved.",
                    "requirement_code": r["code"], "status": "draft",
                    "acceptance": [f"{title} is available to authorized users",
                                   f"Unauthorized access to {title.lower()} is denied",
                                   f"Completion of {title.lower()} is auditable"]})
    return out


def gen_architecture(idea: str, reqs: list[dict], evidence: str = "") -> dict:
    """Propose components + relationships with auth/deployment boundaries (§8)."""
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
    """Propose entities with PK/FK-annotated fields (§9)."""
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
    """Propose endpoints with auth and schemas (§10)."""
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
    """Propose security controls (auth, RBAC, validation, secrets) (§11)."""
    items = [("JWT authentication", "All API calls require Bearer JWT"),
             ("RBAC enforcement", "Manager/admin-only approve paths"),
             ("Input validation", "Pydantic schemas on all writes"),
             ("Secrets management", "No secrets in git; env/vault only"),
             ("Upload validation", "Type/size checks, isolated storage")]
    return [{"code": f"SEC-{i:03d}", "title": t, "description": d, "scope": "api"}
            for i, (t, d) in enumerate(items, 1)]


def gen_tasks(reqs: list[dict]) -> list[dict]:
    """Plan implementation tasks per requirement (§12)."""
    out = []
    for i, r in enumerate(reqs[:12], 1):
        out.append({"code": f"TASK-{i:03d}", "epic": "MVP", "title": f"Implement: {r['title']}",
                    "requirement_code": r["code"], "priority": r.get("priority", "medium"), "status": "todo"})
    return out


def gen_tests(reqs: list[dict]) -> list[dict]:
    """Plan test cases (security kind for security requirements) (§13)."""
    out = []
    for i, r in enumerate(reqs[:12], 1):
        kind = "security" if r["type"] == "security" else "acceptance"
        out.append({"code": f"TEST-{i:03d}", "title": f"Validate: {r['title']}", "kind": kind,
                    "requirement_code": r["code"], "steps": "1. Setup 2. Act 3. Assert",
                    "expected": r.get("acceptance_criteria", "Pass")})
    return out
