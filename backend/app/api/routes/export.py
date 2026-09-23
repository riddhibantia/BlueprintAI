"""Export blueprint: Markdown / JSON / OpenAPI (§13 export)."""
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import current_user, project_or_403
from app.models.db import (Project, Requirement, UserStory, ApiEndpoint, TestCase, Prd,
                           ArchitectureComponent, ArchitectureRelationship)
from app.traceability.engine import coverage

router = APIRouter(tags=["export"])


def _bundle(db: Session, pid: str) -> dict:
    p = db.query(Project).filter_by(id=pid).first()
    prd = db.query(Prd).filter_by(project_id=pid).first()
    return {
        "project": {"name": p.name, "idea": p.product_idea, "status": p.blueprint_status},
        "requirements": [{"code": r.code, "title": r.title, "type": r.type, "status": r.status} for r in db.query(Requirement).filter_by(project_id=pid).all()],
        "stories": [{"code": s.code, "story": s.story} for s in db.query(UserStory).filter_by(project_id=pid).all()],
        "apis": [{"method": a.method, "path": a.path, "auth": a.auth} for a in db.query(ApiEndpoint).filter_by(project_id=pid).all()],
        "tests": [{"code": t.code, "title": t.title} for t in db.query(TestCase).filter_by(project_id=pid).all()],
        "prd": (prd.content if prd else {}),
        "coverage": coverage(db, pid),
    }


@router.get("/projects/{pid}/export/json")
def export_json(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Export the full blueprint bundle as JSON."""
    project_or_403(pid, db, user)
    return _bundle(db, pid)


@router.get("/projects/{pid}/export/markdown")
def export_md(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Export the blueprint as Markdown."""
    project_or_403(pid, db, user)
    b = _bundle(db, pid)
    lines = [f"# {b['project']['name']}", "", f"> {b['project']['idea']}", "",
             f"Coverage: {b['coverage']['coverage_pct']}%", "", "## Requirements"]
    lines += [f"- **{r['code']}** {r['title']} ({r['status']})" for r in b["requirements"]]
    lines += ["", "## APIs"] + [f"- `{a['method']} {a['path']}`" for a in b["apis"]]
    lines += ["", "## Tests"] + [f"- **{t['code']}** {t['title']}" for t in b["tests"]]
    return PlainTextResponse("\n".join(lines), media_type="text/markdown")


@router.get("/projects/{pid}/export/openapi")
def export_openapi(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Export endpoints as an OpenAPI 3.0 document (§10)."""
    project_or_403(pid, db, user)
    apis = db.query(ApiEndpoint).filter_by(project_id=pid).all()
    paths = {}
    for a in apis:
        paths.setdefault(a.path, {})[a.method.lower()] = {
            "summary": a.code, "security": [{"bearerAuth": []}] if a.auth == "jwt" else [],
            "responses": {"200": {"description": "OK"}}}
    return {"openapi": "3.0.0", "info": {"title": "DevBlueprint API", "version": "1.0.0"}, "paths": paths}


@router.get("/projects/{pid}/export/pdf")
def export_pdf(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Export the blueprint as PDF (§13 export)."""
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet
    from fastapi.responses import Response
    project_or_403(pid, db, user)
    b = _bundle(db, pid)
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [Paragraph(b["project"]["name"], styles["Title"]),
             Paragraph(f"Idea: {b['project']['idea']}", styles["Normal"]),
             Paragraph(f"Traceability coverage: {b['coverage']['coverage_pct']}%", styles["Normal"]),
             Spacer(1, 12), Paragraph("Requirements", styles["Heading2"])]
    for r in b["requirements"]:
        story.append(Paragraph(f"<b>{r['code']}</b> {r['title']} ({r['status']})", styles["Normal"]))
    story += [Spacer(1, 12), Paragraph("APIs", styles["Heading2"])]
    for a in b["apis"]:
        story.append(Paragraph(f"{a['method']} {a['path']}", styles["Code"]))
    story += [Spacer(1, 12), Paragraph("Tests", styles["Heading2"])]
    for t in b["tests"]:
        story.append(Paragraph(f"<b>{t['code']}</b> {t['title']}", styles["Normal"]))
    doc.build(story)
    return Response(buf.getvalue(), media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=blueprint-{pid[:8]}.pdf"})


KIND_TO_ARCHIFY = {"frontend": "frontend", "api": "backend", "service": "backend", "database": "database",
                   "external": "external", "queue": "messagebus", "security": "security", "cloud": "cloud"}


def _archify_id(name: str, taken: set[str]) -> str:
    """Slugify a component name to an archify id (pattern ^[a-zA-Z][a-zA-Z0-9_-]*$), deduplicated."""
    slug = re.sub(r"[^a-zA-Z0-9_-]", "-", (name or "node").strip().lower()) or "node"
    if not slug[0].isalpha():
        slug = "n-" + slug
    base, i = slug, 2
    while slug in taken:
        slug = f"{base}-{i}"
        i += 1
    taken.add(slug)
    return slug


@router.get("/projects/{pid}/export/archify")
def export_archify(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Export the stored architecture as archify JSON IR (MIT, tt-a1i/archify).

    Deterministic 1:1 mapping — one node per stored component, one edge per
    stored relationship whose endpoints both exist. Nothing is invented; dangling
    relationships are dropped, not guessed. Render with archify's viewer/CLI.
    """
    from app.models.db import TraceabilityLink
    p = project_or_403(pid, db, user)
    comps = db.query(ArchitectureComponent).filter_by(project_id=pid).all()
    if not comps:
        raise HTTPException(404, "No architecture yet — generate it first")
    rels = db.query(ArchitectureRelationship).filter_by(project_id=pid).all()

    taken: set[str] = set()
    id_of = {c.name: _archify_id(c.name, taken) for c in comps}
    nodes = [{"id": id_of[c.name],
              "type": KIND_TO_ARCHIFY.get((c.kind or "").lower(), "backend"),
              "label": c.name[:80],
              "sublabel": " · ".join(x for x in [c.kind, c.boundary] if x)[:120],
              "row": i // 3, "col": i % 3}
             for i, c in enumerate(comps)]
    edges = [{"from": id_of[r.source], "to": id_of[r.target], "label": (r.label or "")[:80]}
             for r in rels if r.source in id_of and r.target in id_of]

    groups: dict[str, list[str]] = {}
    for c in comps:
        if (c.boundary or "").strip():
            groups.setdefault(c.boundary.strip(), []).append(id_of[c.name])
    boundaries = [{"kind": "security-group", "label": b[:80], "wraps": ids} for b, ids in groups.items()]

    links = db.query(TraceabilityLink).filter_by(project_id=pid).limit(200).all()
    trace_items = [f"{l.source_type}:{l.source_id} → {l.target_type}:{l.target_id} ({l.relationship_type})"
                   for l in links[:12]]
    now = datetime.now(timezone.utc).isoformat()
    return {
        "schema_version": 1, "diagram_type": "architecture",
        "meta": {"title": p.name, "subtitle": (p.product_idea or "")[:140], "locale": "en",
                 "animation": "none", "visual_preset": "blueprint", "quality_profile": "standard"},
        "layout": {"mode": "grid", "cols": 3},
        "components": nodes, "connections": edges, "boundaries": boundaries,
        "cards": [
            {"dot": "cyan", "title": "DevBlueprint provenance",
             "items": [f"Exported {now}", f"{len(nodes)} components, {len(edges)} connections",
                       "Edges mirror stored relationships 1:1 — dangling ones dropped, none invented"]},
            {"dot": "violet", "title": "Traceability evidence",
             "items": trace_items or ["No stored links yet"]},
            {"dot": "slate", "title": "Render with archify (MIT, tt-a1i/archify)",
             "items": ["node archify/bin/archify.mjs deliver architecture this-file.json out.html"]},
        ],
    }
