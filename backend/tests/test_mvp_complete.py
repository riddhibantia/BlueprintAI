"""MVP-completion tests (§39/§42/§44): every retrieval endpoint, HITL writes,
traceability suggest/backward, decisions, PDF export, isolation, locking."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


H = {}
PID = {}
REQ = {}


def _auth(client, email):
    r = client.post("/auth/register", json={"email": email, "password": "pass12345"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_full_chain_setup(client):
    H["h"] = _auth(client, "mvp@dev.blue")
    p = client.post("/projects", json={"name": "MVP", "product_idea": "Build an employee expense management platform."}, headers=H["h"]).json()
    PID["id"] = p["id"]
    assert client.post(f"/projects/{p['id']}/requirements/generate", json={"answers": "managers approve"}, headers=H["h"]).status_code == 200
    reqs = client.get(f"/projects/{p['id']}/requirements", headers=H["h"]).json()
    assert len(reqs) >= 5
    for q in reqs[:3]:
        assert client.post(f"/requirements/{q['id']}/approve", headers=H["h"]).status_code == 200
    REQ["list"] = client.get(f"/projects/{p['id']}/requirements", headers=H["h"]).json()
    for path in ["prd/generate", "stories/generate", "architecture/generate", "database/generate",
                 "apis/generate", "security/analyze", "tasks/generate", "tests/generate"]:
        r = client.post(f"/projects/{PID['id']}/{path}", json={}, headers=H["h"])
        assert r.status_code == 200, f"{path}: {r.text}"


def test_retrieval_endpoints(client):
    pid, h = PID["id"], H["h"]
    db = client.get(f"/projects/{pid}/database", headers=h).json()
    assert db["entities"] and all(e["code"].startswith("DB-") for e in db["entities"])
    assert len({e["code"] for e in db["entities"]}) == len(db["entities"])
    assert client.get(f"/projects/{pid}/security", headers=h).json()
    assert client.get(f"/projects/{pid}/tasks", headers=h).json()
    assert client.get(f"/projects/{pid}/runs", headers=h).json()
    stories = client.get(f"/projects/{pid}/stories", headers=h).json()
    assert stories and all(s["acceptance"] for s in stories)


def test_prd_edit_and_approve(client):
    pid, h = PID["id"], H["h"]
    prd = client.get(f"/projects/{pid}/prd", headers=h).json()
    assert "content" in prd
    content = dict(prd["content"])
    content["goals"] = ["Traceable delivery"]
    r = client.put(f"/projects/{pid}/prd", json={"content": content, "status": "approved"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "approved"
    assert client.get(f"/projects/{pid}/prd", headers=h).json()["status"] == "approved"


def test_optimistic_locking(client):
    h = H["h"]
    target = [q for q in REQ["list"] if q["status"] != "approved"][0]
    r = client.put(f"/requirements/{target['id']}", json={"title": "Stale", "expected_version": 999}, headers=h)
    assert r.status_code == 409
    r = client.put(f"/requirements/{target['id']}", json={"title": target["title"] + "!", "expected_version": target["version"]}, headers=h)
    assert r.status_code == 200 and r.json()["version"] == target["version"] + 1


def test_requirement_delete_cleans_links(client):
    pid, h = PID["id"], H["h"]
    victim = REQ["list"][-1]
    assert client.delete(f"/requirements/{victim['id']}", headers=h).status_code == 200
    codes = [q["code"] for q in client.get(f"/projects/{pid}/requirements", headers=h).json()]
    assert victim["code"] not in codes
    links = client.get(f"/projects/{pid}/traceability", headers=h).json()["links"]
    assert all(victim["code"] not in (l["from"], l["to"]) for l in links)


def test_suggest_and_confirm(client):
    pid, h = PID["id"], H["h"]
    s = client.post(f"/projects/{pid}/traceability/suggest", headers=h).json()["suggestions"]
    assert isinstance(s, list)
    if s:
        first = s[0]
        st, sid = first["from"].split(":") if ":" in first["from"] else ("requirement", first["from"])
        tt, tid = first["to"].split(":")
        r = client.post(f"/projects/{pid}/traceability/links",
                        json={"source_type": st, "source_id": sid, "target_type": tt, "target_id": tid}, headers=h)
        assert r.status_code == 200


def test_backward_trace(client):
    pid, h = PID["id"], H["h"]
    apis = client.get(f"/projects/{pid}/apis", headers=h).json()
    assert apis
    back = client.get(f"/projects/{pid}/traceability/{apis[0]['code']}", headers=h).json()
    assert "backward" in back and "forward" in back


def test_issue_decision_and_task_status(client):
    pid, h = PID["id"], H["h"]
    client.post(f"/projects/{pid}/consistency/check", headers=h)
    issues = client.get(f"/projects/{pid}/consistency/issues", headers=h).json()
    if issues:
        r = client.patch(f"/projects/{pid}/consistency/issues/{issues[0]['id']}", json={"status": "resolved"}, headers=h)
        assert r.json()["status"] == "resolved"
    tasks = client.get(f"/projects/{pid}/tasks", headers=h).json()
    assert tasks
    r = client.patch(f"/projects/{pid}/tasks/{tasks[0]['id']}", json={"status": "doing"}, headers=h)
    assert r.json()["status"] == "doing"


def test_arch_component_crud(client):
    pid, h = PID["id"], H["h"]
    c = client.post(f"/projects/{pid}/architecture/components",
                    json={"name": "Search Service", "kind": "service", "boundary": "private"}, headers=h).json()
    names = [x["name"] for x in client.get(f"/projects/{pid}/architecture", headers=h).json()["components"]]
    assert "Search Service" in names
    assert client.delete(f"/projects/{pid}/architecture/components/{c['id']}", headers=h).status_code == 200


def test_pdf_export(client):
    pid, h = PID["id"], H["h"]
    r = client.get(f"/projects/{pid}/export/pdf", headers=h)
    assert r.status_code == 200 and "application/pdf" in r.headers["content-type"] and len(r.content) > 1000


def test_activity_feed_and_timestamps(client):
    pid, h = PID["id"], H["h"]
    detail = client.get(f"/projects/{pid}", headers=h).json()
    assert detail["created_at"] and detail["updated_at"]
    feed = client.get(f"/projects/{pid}/activity", headers=h).json()["events"]
    assert len(feed) > 0
    kinds = {e["kind"] for e in feed}
    assert "audit" in kinds and "agent" in kinds
    assert all("at" in e and "label" in e for e in feed)
    # no chain-of-thought, prompts, or secrets leak into the feed
    blob = " ".join(e.get("detail", "") for e in feed).lower()
    assert "prompt" not in blob and "secret" not in blob


def test_isolation_between_users(client):
    other = _auth(client, "stranger@dev.blue")
    assert client.get(f"/projects/{PID['id']}", headers=other).status_code == 403
    assert client.post(f"/projects/{PID['id']}/knowledge/query", json={"query": "x"}, headers=other).status_code == 403
