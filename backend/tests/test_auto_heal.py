import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_traceability_auto_healing(client):
    # 1. Register & create project
    r = client.post("/auth/register", json={"email": "heal_tester@dev.blue", "password": "Password123!", "name": "Heal Tester"})
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    p = client.post("/projects", json={"name": "Heal Platform", "product_idea": "employee expense reimbursement"}, headers=headers).json()
    pid = p["id"]

    # 2. Generate requirements + run pipeline
    client.post(f"/projects/{pid}/requirements/generate", json={"answers": ""}, headers=headers)
    reqs = client.get(f"/projects/{pid}/requirements", headers=headers).json()
    assert len(reqs) >= 4
    for req in reqs:
        client.post(f"/requirements/{req['id']}/approve", headers=headers)

    client.post(f"/projects/{pid}/pipeline/run", headers=headers)

    # 3. Check baseline coverage
    cov_init = client.get(f"/projects/{pid}/traceability", headers=headers).json()["coverage"]
    assert cov_init["coverage_pct"] > 50

    # 4. Delete one requirement (e.g. first requirement)
    target_rid = reqs[0]["id"]
    target_code = reqs[0]["code"]
    r_del = client.delete(f"/requirements/{target_rid}", headers=headers)
    assert r_del.status_code == 200
    del_data = r_del.json()
    assert del_data["deleted"] == target_code
    assert "auto_healed" in del_data

    # 5. Run explicit auto-heal endpoint
    r_heal = client.post(f"/projects/{pid}/traceability/auto-heal", headers=headers)
    assert r_heal.status_code == 200
    h_data = r_heal.json()
    assert "coverage_after" in h_data
    assert h_data["coverage_after"] > 0
