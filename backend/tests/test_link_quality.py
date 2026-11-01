"""Traceability links must be earned, not dealt out round-robin.

These tests pin the property that made the old generator dishonest: links were
assigned by list position (`functional[i] -> api[i % len(apis)]`) and every
security control was attached to the first endpoint. Both produce a graph that
looks complete while carrying no information, which then feeds coverage,
impact analysis and the consistency checks.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()


@pytest.fixture(scope="module")
def proj(client):
    r = client.post("/auth/register", json={"email": "links@dev.blue", "password": "pass12345"})
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    p = client.post("/projects", json={
        "name": "Tutoring",
        "product_idea": "online tutoring marketplace connecting students with tutors, with booking and payments",
    }, headers=h).json()
    pid = p["id"]
    client.post(f"/projects/{pid}/requirements/generate", json={"answers": ""}, headers=h)
    for q in client.get(f"/projects/{pid}/requirements", headers=h).json():
        client.post(f"/requirements/{q['id']}/approve", headers=h)
    client.post(f"/projects/{pid}/apis/generate", json={}, headers=h)
    client.post(f"/projects/{pid}/security/analyze", json={}, headers=h)
    return {"id": pid, "h": h}


def _links(client, proj):
    return client.get(f"/projects/{proj['id']}/traceability", headers=proj["h"]).json()["links"]


def test_security_controls_do_not_all_land_on_one_endpoint(client, proj):
    """Five controls protecting API-001 and nothing else is a rubber stamp."""
    sec_links = [l for l in _links(client, proj) if l["from"].startswith("security:")]
    targets = {l["to"] for l in sec_links}
    assert sec_links, "security controls must produce at least one link"
    assert len(targets) > 1, f"every security control collapsed onto {targets}"


def test_every_link_targets_an_artifact_that_exists(client, proj):
    """A link to a code that was never generated is a dangling reference."""
    pid, h = proj["id"], proj["h"]
    apis = {a["code"] for a in client.get(f"/projects/{pid}/apis", headers=h).json()}
    secs = {s["code"] for s in client.get(f"/projects/{pid}/security", headers=h).json()}
    known = {"api": apis, "security": secs}
    for l in _links(client, proj):
        typ, code = l["to"].split(":", 1)
        if typ in known:
            assert code in known[typ], f"{l['from']} links to non-existent {l['to']}"


def test_scorer_keys_off_content_not_position(db_session):
    """Direct unit test of the scorer: same rows, different content, different links.

    Positional linking cannot distinguish these two projects — the requirement
    list and endpoint list are identical in shape, only the words differ.
    """
    from app.models.db import Project, Requirement, ApiEndpoint
    from app.traceability.engine import earned_links

    def build(name: str, req_title: str) -> str:
        p = Project(name=name, product_idea=name)
        db_session.add(p)
        db_session.flush()
        db_session.add(Requirement(project_id=p.id, code="REQ-001", title=req_title,
                                   description="", type="functional"))
        db_session.add(ApiEndpoint(project_id=p.id, code="API-001", method="POST", path="/invoices"))
        db_session.add(ApiEndpoint(project_id=p.id, code="API-002", method="POST", path="/tutors"))
        db_session.commit()
        return p.id

    invoices = build("A", "Generate monthly invoices for customers")
    tutors = build("B", "Publish tutor availability calendars")

    a = earned_links(db_session, invoices)
    b = earned_links(db_session, tutors)
    assert [l["target_id"] for l in a] == ["API-001"], a
    assert [l["target_id"] for l in b] == ["API-002"], b


def test_unrelated_requirement_stays_orphaned(db_session):
    """A requirement matching no endpoint must NOT get a pity link.

    The old generator guaranteed every functional requirement a link, so
    coverage could read 100% while nothing real was connected.
    """
    from app.models.db import Project, Requirement, ApiEndpoint
    from app.traceability.engine import earned_links

    p = Project(name="Orphan", product_idea="orphan")
    db_session.add(p)
    db_session.flush()
    db_session.add(Requirement(project_id=p.id, code="REQ-001",
                               title="Comply with GDPR data residency rules",
                               description="", type="functional"))
    db_session.add(ApiEndpoint(project_id=p.id, code="API-001", method="GET", path="/tutors"))
    db_session.commit()

    assert earned_links(db_session, p.id) == []


def test_coverage_is_never_claimed_for_unlinked_requirements(client, proj):
    """Coverage counts only requirements with a real downstream link."""
    pid, h = proj["id"], proj["h"]
    data = client.get(f"/projects/{pid}/traceability", headers=h).json()
    reqs = client.get(f"/projects/{pid}/requirements", headers=h).json()
    linked = {l["from"].split(":")[1] for l in data["links"] if l["from"].startswith("requirement:")}
    assert set(data["coverage"]["orphans"]) == {r["code"] for r in reqs} - linked
