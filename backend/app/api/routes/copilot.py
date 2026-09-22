"""Blueprint Copilot backend (§V2-31/32): OpenAI-compatible adapter + honest rule-based fallback.

Mode is explicit in every response: "ai" (LLM answered) or "rule" (deterministic).
The fallback never pretends to be an LLM. Only safe project data enters the prompt —
counts, codes, issue descriptions, retrieved doc snippets. No secrets, no prompts.
"""
import time
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.api.deps import current_user, project_or_403
from app.models.db import (Project, Requirement, UserStory, ApiEndpoint, ConsistencyIssue,
                           Document, DocumentChunk, AgentRun)
from app.traceability.engine import coverage
from app.rag.retriever import retrieve

router = APIRouter(tags=["copilot"])


class AskIn(BaseModel):
    question: str
    page: str = ""
    selection: str = ""


def _snapshot(db: Session, pid: str) -> dict:
    """Small, safe project snapshot for Copilot context (counts + codes, no secrets)."""
    p = db.query(Project).filter_by(id=pid).first()
    cov = coverage(db, pid)
    reqs = db.query(Requirement).filter_by(project_id=pid).all()
    issues = db.query(ConsistencyIssue).filter_by(project_id=pid, status="open").all()
    return {
        "project": p.name if p else "", "idea": (p.product_idea or "")[:300] if p else "",
        "requirements": len(reqs), "approved": sum(1 for r in reqs if r.status == "approved"),
        "stories": db.query(UserStory).filter_by(project_id=pid).count(),
        "apis": db.query(ApiEndpoint).filter_by(project_id=pid).count(),
        "coverage_pct": cov["coverage_pct"], "orphans": cov["orphans"][:8],
        "open_issues": [{"check": i.check, "severity": i.severity,
                         "description": (i.description or "")[:300]} for i in issues[:5]],
    }


def _evidence(db: Session, pid: str, question: str) -> list[dict]:
    """Top retrieved chunks (source + section + excerpt) for grounding."""
    rows = db.query(DocumentChunk, Document.name).join(Document, Document.id == DocumentChunk.document_id)\
        .filter(Document.project_id == pid).limit(200).all()
    chunks = [{"content": c.content, "section": c.section, "source": name} for c, name in rows]
    return retrieve(chunks, question, k=3) if chunks else []


def rule_answer(snap: dict, page: str, selection: str) -> tuple[str, list[dict]]:
    """Deterministic Copilot: answers from live project data, states its limits."""
    lines = [f"Rule-based Copilot · {snap['project']} · {snap['requirements']} requirements ({snap['approved']} approved), "
             f"{snap['stories']} stories, {snap['apis']} APIs, traceability {snap['coverage_pct']}%."]
    if page:
        lines.append(f"Viewing: {page}" + (f" · selected {selection}" if selection else "") + ".")
    if snap["orphans"]:
        lines.append(f"Gaps: {len(snap['orphans'])} orphaned requirements ({', '.join(snap['orphans'][:5])}) — link them in Traceability.")
    else:
        lines.append("Gaps: none — every requirement links downstream.")
    if snap["open_issues"]:
        lines.append(f"Attention: {len(snap['open_issues'])} open consistency issues, e.g. [{snap['open_issues'][0]['severity']}] {snap['open_issues'][0]['description'][:160]}")
    else:
        lines.append("Attention: no open consistency issues.")
    lines.append("I compute from live project data only. For open-ended design questions, configure an LLM key for AI mode.")
    return "\n".join(lines), []


def ai_answer(snap: dict, question: str, evidence: list[dict]) -> dict:
    """LLM-backed Copilot via any OpenAI-compatible endpoint (OpenAI, Gemini, Groq…)."""
    from openai import OpenAI
    key = settings.LLM_API_KEY or settings.OPENAI_API_KEY
    kwargs: dict = {"api_key": key, "timeout": 25}
    if settings.LLM_BASE_URL:
        kwargs["base_url"] = settings.LLM_BASE_URL
    client = OpenAI(**kwargs)
    ctx = (f"Project: {snap['project']} ({snap['idea']}). Requirements: {snap['requirements']} "
           f"({snap['approved']} approved). Stories: {snap['stories']}. APIs: {snap['apis']}. "
           f"Traceability: {snap['coverage_pct']}%. Orphans: {snap['orphans']}. "
           f"Open issues: {[i['description'][:200] for i in snap['open_issues']]}. ")
    ev = "\n".join(f"- [{h.get('source')}] {h.get('content', '')[:400]}" for h in evidence)
    system = ("You are Blueprint Copilot, an assistant inside an engineering workspace. "
              "Answer only from the project context and evidence below. If the answer is not "
              "supported, say what is missing instead of guessing. Be concise.")
    r = client.chat.completions.create(
        model=settings.copilot_model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": ctx + "\nEvidence:\n" + ev + f"\nQuestion: {question}"}],
        temperature=0.2, max_tokens=500)
    text = (r.choices[0].message.content or "").strip()
    tokens = getattr(r.usage, "total_tokens", 0) if getattr(r, "usage", None) else 0
    return {"text": text, "tokens": int(tokens or 0)}


@router.get("/projects/{pid}/copilot/mode")
def mode(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Which Copilot serves this project: ai (key configured) or rule (deterministic)."""
    project_or_403(pid, db, user)
    if settings.copilot_configured:
        return {"mode": "ai", "provider": "openai-compatible",
                "endpoint": settings.LLM_BASE_URL or "https://api.openai.com/v1",
                "model": settings.copilot_model}
    return {"mode": "rule", "provider": "deterministic",
            "note": "Set LLM_API_KEY (+ optional LLM_BASE_URL / LLM_MODEL) for AI mode. Free keys: Google AI Studio, Groq."}


@router.post("/projects/{pid}/copilot/ask")
def ask(pid: str, body: AskIn, db: Session = Depends(get_db), user=Depends(current_user)):
    """Ask the Copilot with project + page + selection context (§V2-30/32)."""
    t0 = time.time()
    project_or_403(pid, db, user)
    snap = _snapshot(db, pid)
    evidence = _evidence(db, pid, body.question)
    if not settings.copilot_configured:
        text, _ = rule_answer(snap, body.page, body.selection)
        return {"mode": "rule", "answer": text, "evidence": evidence,
                "latency_ms": int((time.time() - t0) * 1000)}
    try:
        out = ai_answer(snap, body.question, evidence)
        return {"mode": "ai", "answer": out["text"], "evidence": evidence,
                "tokens": out["tokens"], "latency_ms": int((time.time() - t0) * 1000)}
    except Exception as e:
        text, _ = rule_answer(snap, body.page, body.selection)
        return {"mode": "rule", "answer": text + f"\n(AI unreachable: {str(e)[:160]} — rule-based answer.)",
                "evidence": evidence, "latency_ms": int((time.time() - t0) * 1000)}
