"""Domain-aware engineering generators & Senior Product Manager PRD engine.

Produces tailored, idea-specific requirements, authentic Product Manager PRDs,
data models, REST APIs, and validation suites grounded in RAG evidence.
"""
import json
import logging
import re
from typing import List, Dict, Any

from app.agents.base import complete, complete_json
from app.core.config import settings

log = logging.getLogger("devblueprint.agents.generators")


def clarify_questions(idea: str) -> list[str]:
    """Targeted discovery questions that expose the idea's scope and architecture ambiguities (§6.2)."""
    low = idea.lower()
    base = [
        "Who are the primary target users and organizational roles?",
        "What authentication and identity mechanism is required (OAuth, JWT, SSO)?",
        "What are the core transactional entities and primary user journeys?",
        "What compliance, regulatory, or data-residency constraints apply (HIPAA, PCI, GDPR)?",
        "What external integrations and third-party APIs are required?",
    ]
    extra = []
    if any(k in low for k in ("health", "patient", "doctor", "clinic", "medical", "hospital", "trial", "ehr")):
        extra = [
            "Are patient electronic health records (EHR/FHIR) ingested directly or uploaded as documents?",
            "What criteria determine candidate eligibility and who conducts final clinical verification?",
        ]
    elif any(k in low for k in ("expense", "payment", "bank", "invoice", "fintech", "lending", "ledger")):
        extra = [
            "What is the approval threshold hierarchy and multi-department routing logic?",
            "Are receipt OCR scanning and automatic tax/currency conversion needed for v1?",
        ]
    elif any(k in low for k in ("shop", "store", "cart", "order", "ecommerce", "food", "delivery")):
        extra = [
            "How is real-time inventory locked during checkout to prevent overselling?",
            "Are dynamic delivery estimates and driver GPS telemetry part of the initial MVP?",
        ]
    elif any(k in low for k in ("school", "student", "teacher", "course", "grade", "education", "lms")):
        extra = [
            "What grading rubrics, assignment submission formats, and anti-plagiarism checks are needed?",
            "Do students, parents, and department heads each require separate visibility portals?",
        ]
    return base + extra


STOPWORDS = set(
    "a an the to for of and or with my our new your you we they it its this that "
    "app application platform system software tool service online site website portal "
    "management tracker tracking marketplace manager build builder create maker studio "
    "smart easy simple little aesthetic modern best top ultimate pro plus go get use used using "
    "employee employees user users customer customers manager managers admin admins staff "
    "approve approves approved managing manage manages track tracks send sends "
    "receive receives email emails book books booking create creates delete deletes update updates "
    "clinical medical digital automated automatic ai ml intelligent mobile web cloud central "
    "primary secondary daily monthly annual realtime instant based oriented driven powered"
    .split()
)

FALLBACK_ENTITIES = ["Record", "Request", "Item"]


def _plural(noun: str) -> str:
    """Accurate English pluralization for domain entities."""
    if not noun:
        return ""
    if noun.endswith("ing"):
        return noun
    if noun.endswith("y") and len(noun) > 1 and noun[-2] not in "aeiou":
        return noun[:-1] + "ies"
    if noun.endswith(("s", "x", "ch", "sh", "z")):
        return noun + "es"
    return noun + "s"


def _singular(w: str) -> str:
    """Extract singular form for entity keys."""
    if not w:
        return ""
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("es") and len(w) > 3 and w[-3] in ("s", "x", "z") or w.endswith(("ches", "shes")):
        return w[:-2]
    if w.endswith("s") and not w.endswith(("ss", "us", "is")):
        return w[:-1]
    return w


def _detect_domain(text: str) -> str:
    """Classify product domain to select authentic templates and persona models."""
    t = (text or "").lower()
    if any(k in t for k in ("health", "patient", "doctor", "clinic", "medical", "hospital", "clinical trial", "ehr", "hipaa", "oncology", "pharma")):
        return "healthcare"
    if any(k in t for k in ("expense", "reimbursement", "payroll", "banking", "invoice", "fintech", "lending", "ledger", "tax report")):
        return "fintech"
    if any(k in t for k in ("ecommerce", "shopping cart", "retail store", "food delivery", "restaurant order")):
        return "ecommerce"
    if any(k in t for k in ("school", "university", "course catalog", "curriculum", "gradebook", "lms")):
        return "edtech"
    if any(k in t for k in ("docker", "kubernetes", "ci/cd", "deployment pipeline", "cluster")):
        return "devops"
    return "general"


def _entities(idea: str, answers: str = "") -> list[str]:
    """Extract discriminating domain entity names from idea, answers, and context."""
    words = re.findall(r"[A-Za-z][A-Za-z\-]{2,}", f"{idea} {answers}")
    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        if w.isupper() and len(w) <= 4:
            continue
        key = _singular(w.lower()).strip("-")
        if not key or key in STOPWORDS or key in seen or len(key) < 3:
            continue
        seen.add(key)
        noun = "-".join(p.capitalize() for p in key.split("-"))
        if noun not in out:
            out.append(noun)
        if len(out) == 4:
            break
    for fb in FALLBACK_ENTITIES:
        if len(out) >= 3:
            break
        if fb not in out:
            out.append(fb)
    return out[:3]


def gen_requirements(idea: str, answers: str = "", evidence: str = "") -> list[dict]:
    """Draft typed, domain-specific requirements with acceptance criteria (§6.3).

    Integrates LLM structured generation when configured, with a comprehensive
    domain-aware fallback ensuring realistic, tailored requirements every time.
    """
    domain = _detect_domain(f"{idea} {answers} {evidence}")
    ents = _entities(idea, answers)
    e1 = ents[0] if len(ents) > 0 else "Record"
    e2 = ents[1] if len(ents) > 1 else "Item"
    e1p, e2p = _plural(e1), _plural(e2)
    e1l, e2l = e1.lower(), e2.lower()
    e1pl, e2pl = e1p.lower(), e2p.lower()

    # Attempt structured LLM generation if real inference is configured
    if settings.use_openai:
        prompt = (
            f"Generate 8 software requirements for this product idea:\n"
            f"IDEA: {idea}\n"
            f"USER CLARIFICATIONS: {answers}\n"
            f"KNOWLEDGE EVIDENCE: {evidence[:1000]}\n\n"
            f"Return JSON format: {{\"requirements\": [{{\"code\": \"REQ-001\", \"title\": \"...\", \"type\": \"functional|security|non-functional|constraint|business-rule\", \"priority\": \"critical|high|medium\", \"description\": \"...\", \"acceptance_criteria\": \"...\"}}]}}"
        )
        try:
            res = complete_json(prompt, system="You are a Principal Product Manager & Systems Architect. Generate concrete, professional requirements tailored specifically to the user's product statement.")
            raw_reqs = res.get("data", {}).get("requirements", [])
            if isinstance(raw_reqs, list) and len(raw_reqs) >= 6:
                out = []
                for i, r in enumerate(raw_reqs[:10], 1):
                    code = f"REQ-{i:03d}"
                    out.append({
                        "code": code,
                        "title": str(r.get("title", f"Requirement {i}")).strip(),
                        "type": str(r.get("type", "functional")).lower(),
                        "priority": str(r.get("priority", "high")).lower(),
                        "description": str(r.get("description", "")).strip(),
                        "acceptance_criteria": str(r.get("acceptance_criteria", "")).strip(),
                        "status": "draft",
                    })
                return out
        except Exception as exc:
            log.warning("LLM requirements generation fallback: %s", exc)

    # High-quality Domain-Specific Fallback
    if domain == "healthcare":
        core = [
            (f"Patient intake, health history ingestion, and demographic profile management", "functional", "high",
             f"Patients and clinical staff can onboard, submit electronic medical records, and maintain structured health profiles. "
             "In plain terms: patient data is cleanly collected and organized for clinical review.",
             "A registered patient or coordinator can upload health summaries; verified records appear in the active roster."),

            (f"Create and manage {e1p}", "functional", "high",
             f"Clinical staff can create, manage, and track {e1pl} across the care lifecycle. "
             f"In plain terms: {e1l} records are fully under the user's control.",
             f"A coordinator can create a {e1l} and view active status in the clinical registry."),

            (f"Clinical trial protocol matching and eligibility criteria scoring engine", "functional", "high",
             f"Automated evaluation comparing patient biomarkers, diagnosis codes, and history against active trial protocols. "
             "In plain terms: the system automatically identifies trials that match patient medical criteria.",
             "Submitting a patient profile computes matching eligibility scores against trial registries within 2 seconds."),

            (f"Role-based access control for Oncologists, Coordinators, and Patients", "security", "high",
             f"Granular permission boundaries ensuring clinicians, trial site staff, and patients only access authorized PHI. "
             "In plain terms: doctors see their assigned patients, while patients only see their own records.",
             "Unauthorized attempts to view another patient's medical records return HTTP 403 and write an audit event."),

            (f"HIPAA-compliant data encryption for Protected Health Information (PHI)", "security", "high",
             f"All medical records, genomic data, and identifiers are encrypted with AES-GCM-256 at rest and TLS 1.3 in transit. "
             "In plain terms: patient health data is unreadable if intercepted or accessed outside the application.",
             "Database fields containing PHI are encrypted; decrypted values are never leaked in unauthenticated responses."),

            (f"Sub-second trial search and multi-parameter filtering under peak clinical load", "non-functional", "medium",
             f"The trial registry and patient search endpoints respond with P95 latency under 500ms even with 50,000+ records. "
             "In plain terms: physicians never wait on slow search screens when reviewing urgent cases.",
             "95% of trial search queries complete in under 500ms under standard concurrent load."),

            (f"Isolated credential vault for electronic health record (EHR) integrations", "constraint", "high",
             f"FHIR/HL7 API tokens, database passwords, and third-party keys are stored exclusively in secure environment vaults. "
             "In plain terms: no clinical integration secrets can ever leak into source code or logs.",
             "No sensitive credentials appear in application logs, database exports, or git repositories."),

            (f"Physician review and formal clinical enrollment sign-off workflow", "business-rule", "medium",
             f"Patients matched to a trial protocol require explicit verification and sign-off from an attending oncologist before enrollment. "
             "In plain terms: AI suggests matches, but a licensed physician must review and approve before enrollment proceeds.",
             "A patient cannot be marked 'enrolled' without an attending physician's signed approval timestamp."),
        ]
    elif domain == "fintech":
        core = [
            (f"Accounts: sign up and log in to manage {e1pl}", "functional", "high",
             f"Employees and finance managers can register, authenticate securely, and access their expense dashboards. "
             "In plain terms: users get their own secure login, and credentials are protected.",
             "A new employee can register, sign in with their password, and reach their expense workspace."),

            (f"Create and manage {e1p}", "functional", "high",
             f"Employees can add, edit, itemize, and submit {e1p} with digital attachments. "
             f"In plain terms: the {e1l} list is fully under the user's control.",
             f"A user can create an {e1l} and see it in their active list; updates reflect immediately."),

            (f"Automated multi-currency conversion and tax computation engine", "functional", "high",
             f"Real-time currency exchange rates and VAT/sales tax calculations applied to international transactions. "
             "In plain terms: expenses incurred in foreign currencies are converted and tax is calculated accurately.",
             "Submitting a foreign currency receipt converts to the corporate base currency using the transaction-date exchange rate."),

            (f"Multi-tier departmental and management approval routing matrix", "security", "high",
             f"Hierarchical authorization where spend exceeding thresholds routes to department heads and finance controllers. "
             "In plain terms: managers only approve expenses for their own teams, and large sums require executive review.",
             "Expenses over threshold trigger secondary approval; non-managers cannot approve pending claims."),

            (f"Tamper-evident financial transaction ledger and general ledger history", "non-functional", "medium",
             f"Every status change, approval, rejection, and reimbursement is recorded to an append-only journal. "
             "In plain terms: you can always answer who approved which payment and when.",
             "Reimbursement events generate immutable ledger entries with transaction hashes and actor IDs."),

            (f"High-throughput ledger processing with sub-500ms settlement API latency", "non-functional", "medium",
             f"Financial reporting dashboards and transaction lists answer in under half a second during month-end closes. "
             "In plain terms: the system remains snappy even during heavy accounting periods.",
             "Dashboard queries execute within 500ms with over 100,000 recorded transactions."),

            (f"PCI-DSS compliant credential vault and banking token isolation", "constraint", "high",
             f"Corporate card secrets, banking webhook tokens, and encryption keys live in isolated vaults outside application state. "
             "In plain terms: bank access details can never be exposed in code or error traces.",
             "No payment provider credentials or bank accounts appear in plain text in logs or code."),

            (f"Dual-authorization disbursement gate before bank payout settlement", "business-rule", "medium",
             f"Reimbursement payouts require dual sign-off from finance and compliance before automated bank transfers trigger. "
             "In plain terms: money never leaves the company account without two verified approvals.",
             "An expense batch cannot be disbursed until two distinct authorized approvers sign off."),
        ]
    else:
        # General / Universal Domain Engine: tailored to project idea + extracted entities
        core = [
            (f"Accounts: sign up and log in to manage {e1pl}", "functional", "high",
             f"Anyone can create an account and sign in securely to manage their {e1pl}. "
             "In plain terms: your users get their own login, and passwords are never stored as readable text.",
             f"A new user can register, log in, and reach their {e1pl}; a wrong password is rejected."),

            (f"Create and manage {e1p}", "functional", "high",
             f"Users can add, edit, and remove {e1p} — the core thing this product handles. "
             f"In plain terms: the {e1l} list is fully under the user's control.",
             f"A user can create an {e1l} and see it in their list; deleting removes it everywhere."),

            (f"Permissions: who can see and change {e1p}", "security", "high",
             f"Managers, staff, and customers each see only the {e1pl} their role allows. In plain terms: "
             "no peeking at other people's data.",
             f"A customer cannot open manager-only {e1pl}; every denial is logged."),

            (f"{e1} history nobody can erase", "non-functional", "medium",
             f"Every change to an {e1l} is written to a tamper-proof history. In plain terms: you can "
             "always answer 'who changed what, and when?'",
             f"Creating or approving an {e1l} appears in the log with actor and timestamp."),

            (f"Block harmful input in {e1l} forms", "security", "high",
             f"Every {e1l} form and API rejects malicious or malformed input. In plain terms: typing "
             "something nasty into a field can never break or trick the app.",
             f"Script payloads in {e1l} inputs are neutralized; oversized uploads are refused."),

            (f"Fast {e1pl}, even when busy", "non-functional", "medium",
             f"Pages answer in under half a second even with thousands of {e1pl}. In plain terms: the app "
             "never keeps users staring at a spinner.",
             "95% of reads complete in under 500ms under normal load."),

            ("Secrets locked away from code", "constraint", "high",
             "Passwords, keys, and tokens live in vaults or environment config — never in code, "
             "logs, or the repo. In plain terms: a leaked screenshot can't leak access.",
             "No secret appears in code, logs, or version history."),

            (f"Review and approve {e2p}", "business-rule", "medium",
             f"Important {e2pl} go live only after a second pair of eyes. In plain terms: "
             f"nothing ships by accident — {e2pl} move submitted → approved or rejected.",
             f"An {e2.lower()} cannot go live before approval; rejections record a reason."),
        ]

    return [
        {
            "code": f"REQ-{i:03d}",
            "title": title,
            "description": desc,
            "type": typ,
            "priority": pri,
            "acceptance_criteria": ac,
            "status": "draft",
        }
        for i, (title, typ, pri, desc, ac) in enumerate(core, 1)
    ]


def gen_prd(idea: str, reqs: list[dict], evidence: str = "") -> dict:
    """Generate an authentic Product Requirements Document (PRD) as written by a Staff Product Manager (§6.4).

    Integrates LLM generation when configured, and provides an authoritative,
    domain-accurate PM document covering problem space, user personas, goals,
    journeys, functional scope, NFRs, and milestone roadmap.
    """
    domain = _detect_domain(f"{idea} {evidence}")
    approved = [r for r in reqs if r.get("status") == "approved"] or reqs
    func = [f"[{r['code']}] {r['title']}" for r in approved if r.get("type") == "functional"]
    nonf = [f"[{r['code']}] {r['title']}" for r in approved if r.get("type") != "functional"]
    high = [f"[{r['code']}] {r['title']}" for r in approved if r.get("priority") in ("high", "critical")]
    short = (idea[:140] + "…") if len(idea) > 140 else idea

    llm = complete(f"PRD outline for {idea} with {len(reqs)} requirements", evidence)
    # Attempt structured LLM generation if configured
    if settings.use_openai:
        prompt = (
            f"You are a Staff Product Manager at a leading tech company. Write an executive-ready, professional PRD for:\n"
            f"PRODUCT: {idea}\n"
            f"REQUIREMENTS: {[r['title'] for r in reqs[:10]]}\n"
            f"EVIDENCE CONTEXT: {evidence[:1200]}\n\n"
            f"Return JSON with keys: overview (str), problem (str), goals (list[str]), non_goals (list[str]), "
            f"personas (list[str]), user_journeys (list[str]), scope_out (list[str]), "
            f"success_metrics (list[str]), risks (list[str]), milestones (list[str])."
        )
        try:
            res = complete_json(prompt, system="You write clear, persuasive, customer-focused PRDs with crisp personas, real problems, and measurable business outcomes.")
            d = res.get("data", {})
            if d.get("overview") and d.get("problem"):
                return {
                    "overview": d["overview"],
                    "problem": d["problem"],
                    "goals": d.get("goals", []),
                    "non_goals": d.get("non_goals", []),
                    "personas": d.get("personas", []),
                    "user_journeys": d.get("user_journeys", [
                        "1. Onboarding & Setup: User registers and configures domain settings.",
                        "2. Core Workflow: User initiates primary transaction or record ingestion.",
                        "3. Review & Verification: Automated validation and management approval.",
                        "4. Settlement & Auditing: Final status commit and notification dispatch."
                    ]),
                    "scope_in": func[:12] or [f"[{r['code']}] {r['title']}" for r in approved[:8]],
                    "scope_out": d.get("scope_out", ["Custom on-premise hardware integrations deferred to v2"]),
                    "non_functional": nonf[:12] or ["Sub-500ms P95 API response time", "99.9% platform availability SLA"],
                    "priority_focus": high[:6] or func[:4],
                    "user_experience": ["Intuitive, low-friction workflows with immediate status feedback", "Accessible design conforming to WCAG 2.1 AA standards"],
                    "success_metrics": d.get("success_metrics", ["Reduce manual cycle time by 50%", "100% auditable recordkeeping"]),
                    "risks": d.get("risks", ["Adoption friction — mitigate with intuitive guided onboarding"]),
                    "milestones": d.get("milestones", ["M1: Core MVP Launch", "M2: Approvals & Automation", "M3: Scale & Analytics"]),
                    "open_questions": ["What external API rate limits must we accommodate?", "Which roles require multi-factor authentication on Day 1?"],
                    "constraints": ["Zero secrets in source code", "Human-in-the-loop approval gates for critical state changes"],
                    "assumptions": ["Users have modern web browsers with standard broadband connectivity", "Primary integrations provide stable REST/JSON APIs"],
                    "acceptance": ["All approved REQs have linked passing test cases", "Traceability coverage is 100% prior to production release sign-off"],
                }
        except Exception as exc:
            log.warning("LLM PRD generation fallback: %s", exc)

    # Domain-Tailored Product Manager PRD Engine
    if domain == "healthcare":
        overview = (
            f"{short} — an intelligent clinical platform purpose-built for oncology practices, research institutions, "
            f"and clinical trial coordinators. The system eliminates recruitment delays by automating patient record ingestion, "
            f"protocol eligibility matching, and compliant physician enrollment workflows across {len(approved)} core requirements."
        )
        problem = (
            f"Clinical trial recruitment in oncology faces severe failure rates: over 80% of clinical trials miss enrollment deadlines, "
            f"and eligible cancer patients are rarely identified in time due to fragmented electronic health records and dense medical eligibility protocols. "
            f"Without a modern, automated platform, coordinators spend hundreds of manual hours reviewing charts while patients miss out on life-saving therapies."
        )
        personas = [
            "Attending Oncologist — evaluates patient diagnoses, reviews AI-suggested protocol matches, and conducts clinical enrollment sign-off.",
            "Clinical Trial Coordinator — manages trial protocol criteria, monitors screening funnels, tracks consents, and coordinates patient visits.",
            "Patient / Caregiver — accesses educational trial overviews, provides informed consent, and views enrollment milestones in plain language.",
            "Compliance & Data Privacy Officer — audits PHI access logs, ensures strict HIPAA de-identification, and oversees regulatory compliance.",
        ]
        goals = [
            "Accelerate patient-to-trial eligibility matching from an average of 14 days to under 2 hours.",
            "Achieve 100% HIPAA compliance and zero-trust PHI data protection across all ingestion and storage layers.",
            "Increase qualified trial enrollment rates by 3x through automated biomarker and clinical protocol evaluation.",
            "Provide complete visibility into patient screening funnels with immutable, auditable clinical sign-off records.",
        ]
        non_goals = [
            "Direct clinical medical diagnosis or replacing licensed physician clinical judgment.",
            "Direct pharmacy dispensing or physical biological specimen handling in v1.",
            "Direct hospital bedside monitor hardware telemetry streaming.",
        ]
        user_journeys = [
            "1. Patient Profile Ingestion: Clinical coordinator imports structured patient medical summaries and biomarker criteria.",
            "2. Automated Protocol Scoring: System evaluates patient records against active trial registries and computes eligibility confidence scores.",
            "3. Physician Review: Attending oncologist reviews top-ranked trial matches with highlighted inclusion/exclusion criteria.",
            "4. Informed Consent & Enrollment: Coordinator initiates consent documentation; upon verified sign-off, patient is enrolled.",
        ]
        metrics = [
            "Trial Eligibility Match Accuracy: >92% verified clinical relevance.",
            "Physician Review Turnaround Time: <24 hours from match generation to sign-off decision.",
            "System Availability: 99.95% uptime SLA for hospital clinical access.",
            "Audit Integrity: 100% of PHI access events recorded in immutable audit logs.",
        ]
        risks = [
            "Incomplete patient chart data leading to false-negative matches — mitigate with clear confidence scoring and missing-data flags.",
            "Physician alert fatigue — mitigate by only presenting high-affinity protocol candidates with structured rationale.",
        ]
    elif domain == "fintech":
        overview = (
            f"{short} — a modern, automated financial platform that streamlines corporate expense management, invoice settlement, "
            f"and multi-tier approval hierarchies. It unifies transaction ingestion, tax computation, and general ledger compliance "
            f"across {len(approved)} approved requirements."
        )
        problem = (
            f"Organizations lose countless hours and face severe audit exposure from manual expense reporting, lost paper receipts, "
            f"delayed multi-level approvals, and error-prone accounting spreadsheets. Finance teams struggle with visibility, while employees "
            f"face weeks of reimbursement delays."
        )
        personas = [
            "Submitting Employee — uploads receipts, itemizes transactions, and tracks reimbursement approvals in real-time.",
            "Department Manager — reviews team expenses against monthly budgets and authorizes departmental spend.",
            "Finance Controller / Auditor — reconciles corporate ledger accounts, enforces tax policy, and executes automated disbursements.",
            "System Administrator — manages user roles, ERP integration webhooks, and security audit configurations.",
        ]
        goals = [
            "Reduce the expense reimbursement cycle from an industry-average 18 days to under 48 hours.",
            "Eliminate manual data entry via automated receipt extraction and policy categorization.",
            "Ensure 100% audit readiness with tamper-evident general ledger transaction trails.",
            "Prevent duplicate claims and unauthorized spend before funds are disbursed.",
        ]
        non_goals = [
            "Physical corporate credit card manufacturing or hardware POS card terminal distribution in Phase 1.",
            "Speculative cryptocurrency trading or automated investment wealth management.",
        ]
        user_journeys = [
            "1. Submission: Employee snaps a photo of a receipt; OCR extracts merchant, date, amount, and category.",
            "2. Policy Verification: System automatically checks compliance with corporate spend policies and flags anomalies.",
            "3. Multi-Tier Approval: Manager receives notification and approves via one-click mobile or web review.",
            "4. Accounting Settlement: Finance controller executes batch disbursement; transactions sync to general ledger.",
        ]
        metrics = [
            "Reimbursement Processing Speed: <48 hours from submission to bank settlement.",
            "Automated Policy Compliance: >95% of routine expenses auto-checked without manual queries.",
            "Reconciliation Accuracy: Zero unrecorded balance discrepancies during month-end close.",
        ]
        risks = [
            "Duplicate expense submissions — mitigate with cryptographic receipt hash checking and date/amount heuristics.",
            "Fraudulent claim submission — mitigate with strict dual-authorization disbursement gates.",
        ]
    else:
        # General / Universal Domain Engine: tailored to project idea + extracted entities
        ents_list = _entities(idea)
        e1 = ents_list[0] if len(ents_list) > 0 else "Record"
        e1p = _plural(e1)
        overview = (
            f"{short} — this comprehensive Product Requirements Document defines the product architecture, user personas, "
            f"and functional scope required to build and scale {short} across {len(approved)} approved requirements."
        )
        problem = (
            f"Users and operational teams managing '{short}' currently face fragmented workflows, manual tracking, and disjointed digital tools. "
            f"Without an integrated platform, operational turnaround is sluggish, error rates are elevated, and stakeholders lack real-time visibility."
        )
        personas = [
            f"Primary {e1} Operator — manages day-to-day {e1p.lower()}, submits updates, and monitors ongoing operational status.",
            "Team Lead / Supervisor — reviews pending submissions, tracks milestone progression, and authorizes critical lifecycle changes.",
            "System Administrator / Compliance Officer — configures access permissions, monitors security logs, and ensures system reliability.",
        ]
        goals = [
            f"Digitize and automate the end-to-end management lifecycle for {e1p.lower()}.",
            "Provide real-time visibility, automated validation, and status tracking across all workflow stages.",
            "Ensure rigorous data integrity, role-based security, and a 100% auditable history for every action.",
        ]
        non_goals = [
            "Custom on-premise legacy mainframe hardware connections in Phase 1.",
            "Destructive mass-deletion operations without secondary supervisor verification.",
        ]
        user_journeys = [
            "1. Onboarding & Setup: User registers their account, completes profile configuration, and accesses their workspace.",
            f"2. Core Action: User creates new {e1p.lower()}, defines parameters, and initiates primary transactions.",
            "3. Verification & Approval: The system validates business constraints and routes necessary items for supervisor review.",
            "4. Fulfillment & Auditing: Approved actions finalize, permanent audit logs commit, and real-time alerts dispatch.",
        ]
        metrics = [
            "Turnaround Time Reduction: 50% faster workflow completion compared to manual processes.",
            "Operational Accuracy: Zero data-loss incidents and 100% auditable lifecycle history.",
            "Platform Performance: Sub-500ms P95 latency and 99.9% uptime SLA.",
        ]
        risks = [
            "User workflow adoption — mitigate with intuitive guided navigation and contextual help prompts.",
        ]

    return {
        "overview": overview,
        "problem": problem,
        "goals": goals,
        "non_goals": non_goals,
        "personas": personas,
        "user_journeys": user_journeys,
        "scope_in": func[:12] or [f"[{r['code']}] {r['title']}" for r in approved[:8]],
        "scope_out": ["Custom enterprise on-premise integrations deferred to v2", "Experimental third-party alpha plugins out of scope for initial release"],
        "non_functional": nonf[:12] or [
            "P95 API response latency under 500ms under standard operational load",
            "99.9% platform availability SLA with automated health check monitoring",
            "Role-based access control (RBAC) enforced on every mutating endpoint",
            "Zero secrets in source control; all sensitive keys in encrypted environment vaults",
        ],
        "priority_focus": high[:6] or func[:4],
        "user_experience": [
            "Intuitive, clean interface designed to minimize cognitive load and eliminate repetitive input",
            "High-contrast, accessible typography conforming to WCAG 2.1 AA guidelines",
            "Real-time feedback for all asynchronous operations with explicit error and success indicators",
        ],
        "success_metrics": metrics if 'metrics' in locals() else [
            "Cycle Time Reduction: 50% decrease in manual processing duration",
            "Data Quality: 100% of state transitions tracked with actor and timestamp",
            "System Performance: 99.9% uptime SLA and <500ms P95 latency",
        ],
        "risks": risks if 'risks' in locals() else [
            "Scope creep during development — mitigate with strict MVP boundaries and approval gates",
            "Integration dependency downtime — mitigate with graceful degradation and retry backoff",
        ],
        "milestones": [
            "Milestone 1 (MVP Foundation): Core data model, primary user workflows, and baseline authentication.",
            "Milestone 2 (Automation & Controls): Multi-tier approvals, audit logging, and automated business rules.",
            "Milestone 3 (Scale & Enterprise): Analytics dashboards, third-party integrations, and performance hardening.",
        ],
        "open_questions": [
            "What external API rate limits must we configure for third-party service connections?",
            "Which user roles require mandatory multi-factor authentication (MFA) on initial launch?",
        ],
        "constraints": [
            "Human approval required at every stage boundary before promotion",
            "Local SQLite development compatibility with PostgreSQL + pgvector in production",
        ],
        "assumptions": [
            llm["text"][:200] if (evidence and llm.get("text")) else "Users operate standard modern web browsers with active broadband connections",
            "Primary domain entities and schemas are finalized prior to production cutover",
        ],
        "acceptance": [
            "All approved requirements have linked, passing test cases with 100% traceability coverage",
            "Zero open critical or high-severity consistency issues at release sign-off",
        ],
    }


def gen_stories(reqs: list[dict], evidence: str = "") -> list[dict]:
    """Draft user stories (with acceptance criteria) from functional requirements."""
    out = []
    functional_reqs = [x for x in reqs if x.get("type") in ("functional", "business-rule")]
    if not functional_reqs:
        functional_reqs = reqs[:8]

    for i, r in enumerate(functional_reqs[:15], 1):
        title = r["title"]
        out.append({
            "code": f"US-{i:03d}",
            "title": title,
            "story": f"As a user, I want {title.lower()}, so that the business objective is achieved.",
            "requirement_code": r["code"],
            "status": "draft",
            "acceptance": [
                f"{title} is accessible to authenticated and authorized users",
                f"Validation errors are cleanly reported when invalid parameters are supplied",
                f"Successful execution updates system state and writes an audit event",
            ],
        })
    return out


def gen_architecture(idea: str, reqs: list[dict], evidence: str = "") -> dict:
    """Propose components + relationships with auth/deployment boundaries (§8). Grounded in evidence."""
    low = f"{idea} {evidence}".lower()
    comps = [
        {"name": "Web Frontend (Next.js)", "kind": "frontend", "description": "UI workspace & dashboards", "boundary": "public"},
        {"name": "API Gateway (FastAPI)", "kind": "api", "description": "REST API & authentication", "boundary": "auth:jwt"},
        {"name": "Domain Application Service", "kind": "service", "description": "Business logic & orchestration", "boundary": "private"},
        {"name": "PostgreSQL + pgvector", "kind": "database", "description": "Primary state & vector embeddings", "boundary": "private"},
        {"name": "Secure Object Store (S3)", "kind": "external", "description": "Document & file storage", "boundary": "private"},
    ]
    if any(k in low for k in ("redis", "cache", "latency", "rate-limit", "session")):
        comps.append({"name": "Cache & Session Store (Redis)", "kind": "cache", "description": "In-memory caching & rate limiting", "boundary": "private"})
    if any(k in low for k in ("kafka", "queue", "rabbitmq", "event", "async")):
        comps.append({"name": "Event Bus & Message Queue", "kind": "queue", "description": "Asynchronous event distribution", "boundary": "private"})

    rels = [
        {"source": "Web Frontend (Next.js)", "target": "API Gateway (FastAPI)", "label": "HTTPS / JSON"},
        {"source": "API Gateway (FastAPI)", "target": "Domain Application Service", "label": "Internal RPC"},
        {"source": "Domain Application Service", "target": "PostgreSQL + pgvector", "label": "SQL & Vector Queries"},
        {"source": "Domain Application Service", "target": "Secure Object Store (S3)", "label": "Blob Storage"},
    ]
    if any(c["name"] == "Cache & Session Store (Redis)" for c in comps):
        rels.append({"source": "Domain Application Service", "target": "Cache & Session Store (Redis)", "label": "Cache Reads/Writes"})
    if any(c["name"] == "Event Bus & Message Queue" for c in comps):
        rels.append({"source": "Domain Application Service", "target": "Event Bus & Message Queue", "label": "Event Publishing"})

    return {"components": comps, "relationships": rels}


def gen_db(idea: str, evidence: str = "") -> dict:
    """Propose relational database schema with PK/FK-annotated fields (§9). Grounded in domain."""
    domain = _detect_domain(f"{idea} {evidence}")
    if domain == "healthcare":
        ents = {
            "User": ["user_id(pk)", "name", "email", "role", "created_at"],
            "Patient": ["patient_id(pk)", "user_id(fk→User)", "medical_record_number", "date_of_birth", "biomarkers", "created_at"],
            "Trial": ["trial_id(pk)", "protocol_code", "title", "eligibility_criteria", "status", "created_at"],
            "Enrollment": ["enrollment_id(pk)", "patient_id(fk→Patient)", "trial_id(fk→Trial)", "physician_id(fk→User)", "status", "signed_at"],
        }
    elif domain == "fintech":
        ents = {
            "User": ["user_id(pk)", "name", "email", "role", "department"],
            "Expense": ["expense_id(pk)", "employee_id(fk→User)", "amount", "currency", "category", "status", "created_at"],
            "Approval": ["approval_id(pk)", "expense_id(fk→Expense)", "approver_id(fk→User)", "decision", "comments", "created_at"],
            "Transaction": ["transaction_id(pk)", "expense_id(fk→Expense)", "ledger_code", "settled_amount", "status", "created_at"],
        }
    else:
        ents_list = _entities(f"{idea} {evidence}".strip())
        e1 = ents_list[0] if len(ents_list) > 0 else "Record"
        e2 = ents_list[1] if len(ents_list) > 1 else "Item"
        e1_key = _singular(e1.lower()).replace("-", "_")
        e2_key = _singular(e2.lower()).replace("-", "_")
        ents = {
            "User": ["user_id(pk)", "name", "email", "role"],
            e1: [f"{e1_key}_id(pk)", "owner_id(fk→User)", "title", "status", "created_at"],
            e2: [f"{e2_key}_id(pk)", f"{e1_key}_id(fk→{e1})", "details", "status", "updated_at"],
        }
    return {"entities": [{"name": k, "fields": v} for k, v in ents.items()]}


def parse_db_field(raw: str) -> dict:
    """Split a field annotation like `employee_id(fk→User)` into column data.

    The generator's compact notation is for humans; storage keeps the target
    table on its own so the UI and generated DDL do not print the annotation
    twice (`REFERENCES employee_id(fk→User)` is not valid SQL).
    """
    is_pk, is_fk = "(pk)" in raw, "(fk" in raw
    name = raw.split("(")[0].strip()
    target = raw.split("→", 1)[1].rstrip(")").strip() if is_fk and "→" in raw else ""
    return {"name": name, "dtype": "uuid" if is_pk else "text",
            "is_pk": is_pk, "is_fk": is_fk, "references": target}


def gen_apis(idea: str, evidence: str = "") -> list[dict]:
    """Propose REST endpoints with auth and schemas (§10). Grounded in domain."""
    domain = _detect_domain(f"{idea} {evidence}")
    if domain == "healthcare":
        eps = [
            ("POST", "/patients"),
            ("GET", "/patients"),
            ("GET", "/patients/{id}"),
            ("POST", "/trials"),
            ("GET", "/trials"),
            ("POST", "/trials/{id}/match"),
            ("POST", "/enrollments/{id}/approve"),
        ]
    elif domain == "fintech" or "expense" in (idea or "").lower():
        eps = [
            ("POST", "/expenses"),
            ("GET", "/expenses"),
            ("GET", "/expenses/{id}"),
            ("POST", "/expenses/{id}/approve"),
            ("POST", "/expenses/{id}/reject"),
            ("GET", "/transactions/ledger"),
        ]
    else:
        ents_list = _entities(f"{idea} {evidence}".strip())
        e1 = _plural(ents_list[0]).lower().replace("-", "_") if len(ents_list) > 0 else "records"
        e2 = _plural(ents_list[1]).lower().replace("-", "_") if len(ents_list) > 1 else "items"
        eps = [
            ("POST", f"/{e1}"),
            ("GET", f"/{e1}"),
            ("GET", f"/{e1}/{{id}}"),
            ("POST", f"/{e2}"),
            ("GET", f"/{e2}/{{id}}"),
        ]

    return [
        {
            "code": f"API-{i:03d}",
            "method": m,
            "path": p,
            "auth": "jwt",
            "request_schema": {},
            "response_schema": {},
            "status_codes": [200, 400, 401, 404],
        }
        for i, (m, p) in enumerate(eps, 1)
    ]


def gen_security(evidence: str = "") -> list[dict]:
    """Propose security controls (auth, RBAC, validation, secrets, audit) (§11)."""
    items = [
        ("JWT authentication", "All API calls require Bearer JWT"),
        ("RBAC enforcement", "Manager/admin-only approve paths"),
        ("Input validation", "Pydantic schemas on all writes"),
        ("Secrets management", "No secrets in git; env/vault only"),
        ("Upload validation", "Type/size checks, isolated storage"),
    ]
    low_ev = (evidence or "").lower()
    if "rate" in low_ev or "limit" in low_ev:
        items.append(("Rate limiting", "Protect public endpoints against brute force and abuse"))
    if "mfa" in low_ev or "2fa" in low_ev:
        items.append(("Multi-factor authentication", "MFA required for admin roles and privileged actions"))
    return [
        {"code": f"SEC-{i:03d}", "title": t, "description": d, "scope": "api"}
        for i, (t, d) in enumerate(items, 1)
    ]


def gen_tasks(reqs: list[dict], evidence: str = "") -> list[dict]:
    """Plan implementation tasks per requirement (§12)."""
    out = []
    for i, r in enumerate(reqs[:12], 1):
        out.append({
            "code": f"TASK-{i:03d}",
            "epic": "MVP",
            "title": f"Implement: {r['title']}",
            "requirement_code": r["code"],
            "priority": r.get("priority", "medium"),
            "status": "todo",
        })
    return out


def gen_tests(reqs: list[dict], evidence: str = "") -> list[dict]:
    """Plan test cases (security kind for security requirements) (§13)."""
    out = []
    for i, r in enumerate(reqs[:12], 1):
        kind = "security" if r["type"] == "security" else "acceptance"
        out.append({
            "code": f"TEST-{i:03d}",
            "title": f"Validate: {r['title']}",
            "kind": kind,
            "requirement_code": r["code"],
            "steps": "1. Setup 2. Act 3. Assert",
            "expected": r.get("acceptance_criteria", "Pass"),
        })
    return out
