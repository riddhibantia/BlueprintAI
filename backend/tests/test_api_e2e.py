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

    # Test edit requirement including acceptance_criteria
    first_req = reqs[0]
    rid = first_req["id"]
    update_res = client.put(f"/requirements/{rid}", json={
        "expected_version": first_req["version"],
        "title": "Updated Title",
        "acceptance_criteria": "Given user is manager When click approve Then save"
    }, headers=H["auth"])
    assert update_res.status_code == 200
    assert update_res.json()["version"] == first_req["version"] + 1

    # Stale version test: old expected_version must reject with 409
    stale_res = client.put(f"/requirements/{rid}", json={
        "expected_version": first_req["version"],
        "title": "Stale Title"
    }, headers=H["auth"])
    assert stale_res.status_code == 409


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
    # Fresh client: empty cookie jar, no header -> must be rejected
    with TestClient(app) as fresh:
        r = fresh.get("/projects")
    assert r.status_code in (401, 422)


def test_07_project_update_and_delete(client):
    pid = PID["id"]
    r = client.patch(f"/projects/{pid}", json={"name": "Renamed Platform", "description": "Updated description"}, headers=H["auth"])
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed Platform"

    # Test delete
    r = client.delete(f"/projects/{pid}", headers=H["auth"])
    assert r.status_code == 200
    assert r.json()["deleted"] == pid

    # Verification: should now 404 or 403
    r = client.get(f"/projects/{pid}", headers=H["auth"])
    assert r.status_code in (403, 404)

