"""Default standards pack: retrieval works on first load, re-seeding is safe."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rag.standards_pack import load_pack


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:  # lifespan creates the schema
        yield c


def _auth(client, email):
    r = client.post("/auth/register", json={"email": email, "password": "pass12345"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def project(client):
    h = _auth(client, "standards@dev.blue")
    r = client.post("/projects", headers=h,
                    json={"name": "Standards", "product_idea": "Build an employee expense platform."})
    assert r.status_code == 200, r.text
    body = r.json()
    return {"h": h, "id": body["id"], "created": body}


def test_pack_ships_markdown():
    pack = load_pack()
    assert len(pack) >= 3
    for doc in pack:
        assert doc["name"].endswith(".md")
        assert doc["text"].lstrip().startswith("#")


def test_project_creation_seeds_pack(client, project):
    pack = load_pack()
    assert project["created"]["standards"] == len(pack)

    docs = client.get(f"/projects/{project['id']}/documents", headers=project["h"]).json()
    assert len(docs) == len(pack)
    assert {d["name"] for d in docs} == {d["name"] for d in pack}
    assert {d["source"] for d in docs} == {"default-pack"}
    assert all(d["chunks"] > 0 for d in docs)


def test_query_is_grounded_on_first_load(client, project):
    r = client.post(f"/projects/{project['id']}/knowledge/query",
                    json={"query": "What status code should a conflicting write return?", "k": 5},
                    headers=project["h"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["hits"], "seeded standards should be retrievable without an upload"
    assert "api-conventions.md" in {h["source"] for h in body["hits"]}


def test_reseed_is_idempotent(client, project):
    before = client.get(f"/projects/{project['id']}/documents", headers=project["h"]).json()
    r = client.post(f"/projects/{project['id']}/documents/seed", headers=project["h"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["seeded"] == 0
    assert body["skipped"] == len(load_pack())
    after = client.get(f"/projects/{project['id']}/documents", headers=project["h"]).json()
    assert len(after) == len(before)


def test_seed_respects_project_access(client, project):
    other = _auth(client, "standards-other@dev.blue")
    r = client.post(f"/projects/{project['id']}/documents/seed", headers=other)
    assert r.status_code == 403
    r = client.post("/projects/does-not-exist/documents/seed", headers=other)
    assert r.status_code == 404


def test_upload_still_works_and_dedupes(client, project):
    text = b"# Team standards\n\nAll writes require JWT auth.\n"
    r = client.post(f"/projects/{project['id']}/documents",
                    files={"file": ("team.md", text)}, headers=project["h"])
    assert r.status_code == 200, r.text
    assert r.json()["chunks"] >= 1
    again = client.post(f"/projects/{project['id']}/documents",
                        files={"file": ("team.md", text)}, headers=project["h"])
    assert again.status_code == 200 and again.json()["status"] == "duplicate"


def test_empty_upload_is_rejected_not_indexed(client, project):
    before = client.get(f"/projects/{project['id']}/documents", headers=project["h"]).json()
    r = client.post(f"/projects/{project['id']}/documents",
                    files={"file": ("empty.txt", b"   \n\n")}, headers=project["h"])
    assert r.status_code == 400
    after = client.get(f"/projects/{project['id']}/documents", headers=project["h"]).json()
    assert len(after) == len(before)
