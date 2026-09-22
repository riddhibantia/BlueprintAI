"""Archify IR export tests: schema shape, 1:1 topology, dangling edges dropped, auth."""
import re
import pytest
from fastapi.testclient import TestClient
from app.main import app

ID_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]*$")
TYPES = {"frontend", "backend", "database", "cloud", "security", "messagebus", "external"}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


PID = {}


def test_archify_empty_is_404_not_fabricated(client):
    r = client.post("/auth/register", json={"email": "archify@dev.blue", "password": "pass12345"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    p = client.post("/projects", json={"name": "Empty", "product_idea": "x"}, headers=h).json()
    PID["h"] = h
    assert client.get(f"/projects/{p['id']}/export/archify", headers=h).status_code == 404


def test_archify_mirrors_stored_topology(client):
    h = PID["h"]
    p = client.post("/projects", json={"name": "Arch", "product_idea": "Build an employee expense management platform."}, headers=h).json()
    PID["id"] = p["id"]
    assert client.post(f"/projects/{p['id']}/architecture/generate", json={}, headers=h).status_code == 200
    stored = client.get(f"/projects/{p['id']}/architecture", headers=h).json()
    ir = client.get(f"/projects/{p['id']}/export/archify", headers=h).json()

    assert ir["schema_version"] == 1 and ir["diagram_type"] == "architecture"
    assert ir["meta"]["title"] == "Arch" and ir["layout"]["mode"] == "grid"
    # 1:1 nodes, valid ids + enum types
    assert len(ir["components"]) == len(stored["components"])
    assert {c["label"] for c in ir["components"]} == {c["name"] for c in stored["components"]}
    assert all(ID_RE.match(c["id"]) and c["type"] in TYPES for c in ir["components"])
    # every edge endpoint exists — dangling relationships are dropped, never guessed
    ids = {c["id"] for c in ir["components"]}
    assert all(e["from"] in ids and e["to"] in ids for e in ir["connections"])
    assert len(ir["connections"]) <= len(stored["relationships"])
    assert any(c["title"] == "DevBlueprint provenance" for c in ir["cards"])


def test_archify_requires_auth():
    with TestClient(app) as fresh:
        assert fresh.get(f"/projects/{PID['id']}/export/archify").status_code == 401
