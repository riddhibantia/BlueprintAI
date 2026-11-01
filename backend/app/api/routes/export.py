"""Export blueprint: Markdown / JSON / OpenAPI (§13 export)."""
import re
from datetime import datetime, timezone
from xml.sax.saxutils import escape as _xml_escape
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import current_user, project_or_403
from app.models.db import (Project, Requirement, UserStory, ApiEndpoint, TestCase, Prd,
                           ArchitectureComponent, ArchitectureRelationship)
from app.traceability.engine import coverage

router = APIRouter(tags=["export"])


def _para(text: str) -> str:
    """Escape ReportLab paragraph markup so artifact titles cannot break the PDF."""
    return _xml_escape(text or "")


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
    prd = b.get("prd") or {}
    if prd:
        lines += ["", "## Product Spec"]
        for key, val in prd.items():
            lines.append(f"### {str(key).replace('_', ' ').title()}")
            items = val if isinstance(val, list) else [val]
            lines += [f"- {item}" for item in items]
            lines.append("")
    return PlainTextResponse("\n".join(lines), media_type="text/markdown")


@router.get("/projects/{pid}/export/openapi")
def export_openapi(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Export endpoints as an OpenAPI 3.0 document (§10)."""
    project_or_403(pid, db, user)
    apis = db.query(ApiEndpoint).filter_by(project_id=pid).all()
    paths: dict[str, dict] = {}
    for a in apis:
        method = (a.method or "get").lower()
        path = a.path or "/"
        # Last write wins on duplicate path+method — stored data is append-only
        # per generate run, so collisions indicate a generator bug worth surfacing.
        paths.setdefault(path, {})[method] = {
            "summary": a.code, "security": [{"bearerAuth": []}] if a.auth == "jwt" else [],
            "responses": {"200": {"description": "OK"}}}
    return {"openapi": "3.0.0", "info": {"title": "DevBlueprint API", "version": "1.0.0"}, "paths": paths}


@router.get("/projects/{pid}/export/postman")
def export_postman(pid: str, db: Session = Depends(get_db), user=Depends(current_user)):
    """Export endpoints as a Postman Collection v2.1.0 document."""
    p = project_or_403(pid, db, user)
    apis = db.query(ApiEndpoint).filter_by(project_id=pid).all()
    items = []
    for a in apis:
        raw_path = a.path or "/"
        url_segments = [s for s in raw_path.split("/") if s]
        items.append({
            "name": f"{a.code} - {a.method.upper()} {raw_path}",
            "request": {
                "method": a.method.upper(),
                "header": [
                    {"key": "Content-Type", "value": "application/json", "type": "text"}
                ] if a.method.upper() in ("POST", "PUT", "PATCH") else [],
                "body": {
                    "mode": "raw",
                    "raw": "{\n  // Request payload\n}",
                    "options": {"raw": {"language": "json"}}
                } if a.method.upper() in ("POST", "PUT", "PATCH") else None,
                "url": {
                    "raw": "{{baseUrl}}" + raw_path,
                    "host": ["{{baseUrl}}"],
                    "path": url_segments,
                },
                "auth": {
                    "type": "bearer",
                    "bearer": [{"key": "token", "value": "{{bearerToken}}", "type": "string"}]
                } if a.auth == "jwt" else {"type": "noauth"},
                "description": f"Generated endpoint {a.code}"
            },
            "response": [
                {
                    "name": "Success",
                    "originalRequest": {
                        "method": a.method.upper(),
                        "url": {"raw": "{{baseUrl}}" + raw_path}
                    },
                    "status": "OK",
                    "code": 200,
                    "_postman_previewlanguage": "json",
                    "body": "{\n  \"status\": \"success\"\n}"
                }
            ]
        })
    return {
        "info": {
            "_postman_id": f"devblueprint-{pid[:8]}",
            "name": f"{p.name} API Collection",
            "description": f"Postman Collection generated by DevBlueprint for {p.name}.",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
        },
        "variable": [
            {"key": "baseUrl", "value": "http://localhost:8000", "type": "string"},
            {"key": "bearerToken", "value": "", "type": "string"}
        ],
        "item": items
    }


@router.get("/projects/{pid}/export/schema")
def export_schema_ddl(pid: str, target: str = "postgres", db: Session = Depends(get_db), user=Depends(current_user)):
    """Export database entities in target dialect: postgres, prisma, sqlalchemy, typescript."""
    from app.models.db import DatabaseEntity, DatabaseField
    project_or_403(pid, db, user)
    entities = db.query(DatabaseEntity).filter_by(project_id=pid).all()
    entity_ids = [e.id for e in entities]
    all_fields = db.query(DatabaseField).filter(DatabaseField.entity_id.in_(entity_ids)).all() if entity_ids else []
    field_map: dict[str, list] = {}
    for f in all_fields:
        field_map.setdefault(f.entity_id, []).append(f)

    target = target.lower().strip()
    if target == "prisma":
        code_lines = ["// Prisma Schema generated by DevBlueprint", "datasource db {", '  provider = "postgresql"', '  url      = env("DATABASE_URL")', "}", "", "generator client {", '  provider = "prisma-client-js"', "}", ""]
        for e in entities:
            model_name = "".join(w.capitalize() for w in e.name.replace("-", " ").replace("_", " ").split())
            code_lines.append(f"model {model_name} {{")
            for f in field_map.get(e.id, []):
                t = "String"
                extra = ""
                if f.is_pk:
                    extra = " @id @default(uuid())"
                elif f.dtype in ("int", "integer"):
                    t = "Int"
                elif f.dtype in ("float", "numeric"):
                    t = "Float"
                elif f.dtype in ("bool", "boolean"):
                    t = "Boolean"
                elif f.dtype in ("timestamp", "datetime"):
                    t = "DateTime @default(now())"
                code_lines.append(f"  {f.name.lower()}  {t}{extra}")
            code_lines.append("}\n")
        return PlainTextResponse("\n".join(code_lines), media_type="text/plain")

    elif target == "typescript":
        code_lines = ["// TypeScript Interfaces generated by DevBlueprint\n"]
        for e in entities:
            if_name = "".join(w.capitalize() for w in e.name.replace("-", " ").replace("_", " ").split())
            code_lines.append(f"export interface {if_name} {{")
            for f in field_map.get(e.id, []):
                ts_type = "string"
                if f.dtype in ("int", "integer", "float", "numeric"):
                    ts_type = "number"
                elif f.dtype in ("bool", "boolean"):
                    ts_type = "boolean"
                elif f.dtype in ("timestamp", "datetime"):
                    ts_type = "string | Date"
                code_lines.append(f"  {f.name.lower()}{'?' if f.nullable and not f.is_pk else ''}: {ts_type};")
            code_lines.append("}\n")
        return PlainTextResponse("\n".join(code_lines), media_type="text/plain")

    elif target == "sqlalchemy":
        code_lines = ["# SQLAlchemy Models generated by DevBlueprint", "from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, func", "from sqlalchemy.orm import declarative_base", "", "Base = declarative_base()", ""]
        for e in entities:
            cls_name = "".join(w.capitalize() for w in e.name.replace("-", " ").replace("_", " ").split())
            table_name = e.name.lower().replace("-", "_")
            code_lines.append(f"class {cls_name}(Base):")
            code_lines.append(f'    __tablename__ = "{table_name}"')
            for f in field_map.get(e.id, []):
                args = []
                sqla_type = "String"
                if f.dtype in ("int", "integer"):
                    sqla_type = "Integer"
                elif f.dtype in ("bool", "boolean"):
                    sqla_type = "Boolean"
                elif f.dtype in ("timestamp", "datetime"):
                    sqla_type = "DateTime"
                    args.append("default=func.now()")
                elif f.dtype == "text":
                    sqla_type = "Text"
                if f.is_pk:
                    args.append("primary_key=True")
                if not f.nullable and not f.is_pk:
                    args.append("nullable=False")
                args_str = (", " + ", ".join(args)) if args else ""
                code_lines.append(f"    {f.name.lower()} = Column({sqla_type}{args_str})")
            code_lines.append("\n")
        return PlainTextResponse("\n".join(code_lines), media_type="text/plain")

    else:
        # Default: Postgres DDL
        code_lines = ["-- PostgreSQL DDL generated by DevBlueprint", "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";", ""]
        for e in entities:
            tbl_name = e.name.lower().replace("-", "_")
            code_lines.append(f"CREATE TABLE IF NOT EXISTS {tbl_name} (")
            col_defs = []
            for f in field_map.get(e.id, []):
                dtype = "TEXT"
                if f.is_pk:
                    dtype = "UUID PRIMARY KEY DEFAULT uuid_generate_v4()"
                elif f.dtype in ("int", "integer"):
                    dtype = "INTEGER"
                elif f.dtype in ("bool", "boolean"):
                    dtype = "BOOLEAN DEFAULT FALSE"
                elif f.dtype in ("timestamp", "datetime"):
                    dtype = "TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP"
                null_str = " NOT NULL" if not f.nullable and not f.is_pk else ""
                col_defs.append(f"    {f.name.lower()} {dtype}{null_str}")
            code_lines.append(",\n".join(col_defs))
            code_lines.append(");\n")
        return PlainTextResponse("\n".join(code_lines), media_type="text/plain")



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
    story = [Paragraph(_para(b["project"]["name"]), styles["Title"]),
             Paragraph(f"Idea: {_para(str(b['project']['idea']))}", styles["Normal"]),
             Paragraph(f"Traceability coverage: {b['coverage']['coverage_pct']}%", styles["Normal"]),
             Spacer(1, 12), Paragraph("Requirements", styles["Heading2"])]
    for r in b["requirements"]:
        story.append(Paragraph(f"<b>{_para(r['code'])}</b> {_para(r['title'])} ({_para(r['status'])})", styles["Normal"]))
    story += [Spacer(1, 12), Paragraph("APIs", styles["Heading2"])]
    for a in b["apis"]:
        story.append(Paragraph(_para(f"{a['method']} {a['path']}"), styles["Code"]))
    story += [Spacer(1, 12), Paragraph("Tests", styles["Heading2"])]
    for t in b["tests"]:
        story.append(Paragraph(f"<b>{_para(t['code'])}</b> {_para(t['title'])}", styles["Normal"]))
    prd = b.get("prd") or {}
    if prd:
        story += [Spacer(1, 12), Paragraph("Product Spec", styles["Heading2"])]
        for key, val in prd.items():
            story.append(Paragraph(_para(str(key).replace("_", " ").title()), styles["Heading3"]))
            items = val if isinstance(val, list) else [val]
            for item in items:
                story.append(Paragraph(f"• {_para(str(item))}", styles["Normal"]))
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
