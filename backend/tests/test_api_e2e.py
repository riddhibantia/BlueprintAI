"""Full MVP E2E: idea -> requirements -> PRD -> arch -> traceability -> consistency -> export (§37)."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # enters lifespan -> init_db creates tables
        yield c


H = {"auth": {}}
PID = {}


def test_01_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_02_project_flow(client):
    r = client.post("/auth/register", json={"email": "e2e@dev.blue", "password": "pass12345", "name": "E2E"})
    assert r.status_code == 200, r.text
    H["auth"] = {"Authorization": f"Bearer {r.json()['token']}"}
    r = client.post("/projects", json={"name": "Expense platform", "product_idea": "Build an employee expense management platform."}, headers=H["auth"])
    assert r.status_code == 200, r.text
    PID["id"] = r.json()["id"]


def test_03_requirements(client):
    pid = PID["id"]
    r = client.post(f"/projects/{pid}/requirements/generate", json={"answers": "managers approve"}, headers=H["auth"])
    assert r.status_code == 200 and r.json()["count"] >= 5
    reqs = client.get(f"/projects/{pid}/requirements", headers=H["auth"]).json()
    for q in reqs[:3]:
        a = client.post(f"/requirements/{q['id']}/approve", headers=H["auth"])
        assert a.status_code == 200


def test_04_blueprint_chain(client):
    pid = PID["id"]
    for path in ["prd/generate", "stories/generate", "architecture/generate", "database/generate",
                 "apis/generate", "security/analyze", "tasks/generate", "tests/generate"]:
        r = client.post(f"/projects/{pid}/{path}", json={}, headers=H["auth"])
        assert r.status_code == 200, f"{path}: {r.text}"


def test_05_engines_and_export(client):
    pid = PID["id"]
    t = client.get(f"/projects/{pid}/traceability", headers=H["auth"]).json()
    assert t["coverage"]["total"] > 0
    c = client.post(f"/projects/{pid}/consistency/check", headers=H["auth"]).json()
    assert "count" in c
    reqs = client.get(f"/projects/{pid}/requirements", headers=H["auth"]).json()
    i = client.post(f"/projects/{pid}/impact/analyze", json={"requirement_code": reqs[0]["code"]}, headers=H["auth"])
    assert i.status_code == 200 and "affected" in i.json()
    assert client.get(f"/projects/{pid}/export/json", headers=H["auth"]).status_code == 200
    assert client.get(f"/projects/{pid}/export/openapi", headers=H["auth"]).status_code == 200
    md = client.get(f"/projects/{pid}/export/markdown", headers=H["auth"])
    assert md.status_code == 200 and "REQ-" in md.text


def test_06_unauthorized_blocked(client):
    r = client.get("/projects")
    assert r.status_code in (401, 422)
