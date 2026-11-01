"""Regression tests for senior-review findings: duplicate REQ codes, auth hardening, upload allowlist, audit trail."""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.db import AuditLog


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


H = {}
PID = {}


def test_short_password_rejected(client):
    r = client.post("/auth/register", json={"email": "short@dev.blue", "password": "123", "name": "S"})
    assert r.status_code == 422


def test_email_case_insensitive_unique(client):
    assert client.post("/auth/register", json={"email": "Case@dev.blue", "password": "pass12345"}).status_code == 200
    r = client.post("/auth/register", json={"email": "case@dev.blue", "password": "pass12345"})
    assert r.status_code == 400


def test_regenerate_keeps_codes_unique(client):
    r = client.post("/auth/register", json={"email": "dup@dev.blue", "password": "pass12345"})
    H["h"] = {"Authorization": f"Bearer {r.json()['token']}"}
    p = client.post("/projects", json={"name": "Dup", "product_idea": "expense platform"}, headers=H["h"]).json()
    PID["id"] = p["id"]
    client.post(f"/projects/{p['id']}/requirements/generate", json={"answers": ""}, headers=H["h"])
    client.post(f"/projects/{p['id']}/requirements/generate", json={"answers": ""}, headers=H["h"])
    reqs = client.get(f"/projects/{p['id']}/requirements", headers=H["h"]).json()
    codes = [q["code"] for q in reqs]
    assert len(codes) == len(set(codes)) and len(codes) >= 10


def test_regenerate_replace_no_duplicates(client):
    r = client.post("/auth/register", json={"email": "repl@dev.blue", "password": "pass12345"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    p = client.post("/projects", json={"name": "Repl", "product_idea": "expense platform"}, headers=h).json()
    client.post(f"/projects/{p['id']}/requirements/generate", json={"answers": ""}, headers=h)
    first = client.get(f"/projects/{p['id']}/requirements", headers=h).json()
    client.post(f"/projects/{p['id']}/requirements/generate", json={"answers": "", "replace": True}, headers=h)
    second = client.get(f"/projects/{p['id']}/requirements", headers=h).json()
    assert len(second) == len(first) and len({q["code"] for q in second}) == len(second)


def test_pipeline_run_builds_everything(client):
    r = client.post("/auth/register", json={"email": "pipe@dev.blue", "password": "pass12345"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    p = client.post("/projects", json={"name": "Pipe", "product_idea": "tutoring marketplace"}, headers=h).json()
    client.post(f"/projects/{p['id']}/requirements/generate", json={"answers": ""}, headers=h)
    reqs = client.get(f"/projects/{p['id']}/requirements", headers=h).json()
    assert len(reqs) == 8
    titles = {q["title"] for q in reqs}
    assert "Create and manage Tutoring" in titles  # idea-aware, not generic CRUD
    for q in reqs:
        assert client.post(f"/requirements/{q['id']}/approve", headers=h).status_code == 200
    r = client.post(f"/projects/{p['id']}/pipeline/run", headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert set(out["stages"]) == {"prd", "stories", "architecture", "database", "apis", "security", "tasks", "tests"}
    prd = client.get(f"/projects/{p['id']}/prd", headers=h).json()
    assert "overview" in prd["content"] and "scope_in" in prd["content"]
    assert any("REQ-" in s for s in prd["content"]["scope_in"])
    assert out["coverage_pct"] == 100.0 and out["orphans"] == []
    # second run replaces, never duplicates
    client.post(f"/projects/{p['id']}/pipeline/run", headers=h)
    again = client.get(f"/projects/{p['id']}/requirements", headers=h).json()
    stories = client.get(f"/projects/{p['id']}/stories", headers=h).json()
    assert len(again) == 8 and len(stories) == 3


def test_exe_upload_rejected(client):
    r = client.post(f"/projects/{PID['id']}/documents", files={"file": ("evil.exe", b"MZ...")}, headers=H["h"])
    assert r.status_code == 400


def test_audit_trail_written():
    db = SessionLocal()
    try:
        actions = {a.action for a in db.query(AuditLog).all()}
    finally:
        db.close()
    assert {"user.register", "project.create", "requirements.generate"} <= actions

def test_story_regeneration_refreshes_text_and_reopens_approval(client):
    r = client.post("/auth/register", json={"email": "stale@dev.blue", "password": "pass12345"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    p = client.post("/projects", json={"name": "Stale", "product_idea": "tutoring marketplace"}, headers=h).json()
    client.post(f"/projects/{p['id']}/requirements/generate", json={"answers": ""}, headers=h)
    client.post(f"/projects/{p['id']}/stories/generate", headers=h)
    stories = client.get(f"/projects/{p['id']}/stories", headers=h).json()
    target = stories[0]
    assert client.post(f"/projects/{p['id']}/stories/{target['code']}/approve", headers=h).status_code == 200

    req = next(q for q in client.get(f"/projects/{p['id']}/requirements", headers=h).json()
               if q["code"] == target["req"])
    r = client.put(f"/requirements/{req['id']}", headers=h,
                   json={"title": "Renamed capability", "expected_version": req["version"]})
    assert r.status_code == 200, r.text

    client.post(f"/projects/{p['id']}/stories/generate", headers=h)
    refreshed = {s["code"]: s for s in client.get(f"/projects/{p['id']}/stories", headers=h).json()}
    assert refreshed[target["code"]]["title"] == "Renamed capability"
    assert refreshed[target["code"]]["status"] == "draft"  # approval covered the old text
    assert len(refreshed) == len(stories)


def test_document_lifecycle_and_deletion(client):
    pid, h = PID["id"], H["h"]
    r = client.post(f"/projects/{pid}/documents/upload", files={"file": ("guide.txt", b"# Standards\nMust use JWT auth for all APIs.")}, headers=h)
    assert r.status_code == 200
    doc_id = r.json()["document_id"]
    docs = client.get(f"/projects/{pid}/documents", headers=h).json()
    assert any(d["id"] == doc_id for d in docs)
    del_r = client.delete(f"/projects/{pid}/documents/{doc_id}", headers=h)
    assert del_r.status_code == 200 and del_r.json()["status"] == "deleted"
    docs_after = client.get(f"/projects/{pid}/documents", headers=h).json()
    assert not any(d["id"] == doc_id for d in docs_after)


def test_postman_and_schema_ddl_export(client):
    pid, h = PID["id"], H["h"]
    # Verify postman export
    r_postman = client.get(f"/projects/{pid}/export/postman", headers=h)
    assert r_postman.status_code == 200
    pm = r_postman.json()
    assert "info" in pm and "schema" in pm["info"]
    assert "collection.json" in pm["info"]["schema"]

    # Verify multi-dialect schema exports
    for target in ("postgres", "prisma", "typescript", "sqlalchemy"):
        r_schema = client.get(f"/projects/{pid}/export/schema?target={target}", headers=h)
        assert r_schema.status_code == 200
        assert len(r_schema.text) > 0


def test_artifact_version_history_and_rollback(client):
    pid, h = PID["id"], H["h"]
    # Trigger PRD generation which records a version
    client.post(f"/projects/{pid}/prd/generate", headers=h)
    r_ver = client.get(f"/projects/{pid}/versions?artifact_type=prd", headers=h)
    assert r_ver.status_code == 200
    versions = r_ver.json()
    assert len(versions) >= 1
    vid = versions[0]["id"]
    # Test rollback endpoint
    r_rb = client.post(f"/projects/{pid}/versions/{vid}/rollback", headers=h)
    assert r_rb.status_code == 200
    assert r_rb.json()["status"] == "rolled_back"
