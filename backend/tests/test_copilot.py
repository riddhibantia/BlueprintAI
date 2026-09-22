"""Copilot tests (§V2-31): mode honesty, rule-based answers from real data, safe failure."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


H = {}
PID = {}


def test_mode_without_key_is_rule(client):
    r = client.post("/auth/register", json={"email": "copilot@dev.blue", "password": "pass12345"})
    assert r.status_code == 200
    H["h"] = {"Authorization": f"Bearer {r.json()['token']}"}
    p = client.post("/projects", json={"name": "Copilot", "product_idea": "expense platform"}, headers=H["h"]).json()
    PID["id"] = p["id"]
    m = client.get(f"/projects/{p['id']}/copilot/mode", headers=H["h"]).json()
    assert m["mode"] == "rule"


def test_ask_without_key_uses_real_data(client):
    pid, h = PID["id"], H["h"]
    client.post(f"/projects/{pid}/requirements/generate", json={"answers": ""}, headers=h)
    r = client.post(f"/projects/{pid}/copilot/ask",
                    json={"question": "any gaps?", "page": "requirements", "selection": ""}, headers=h).json()
    assert r["mode"] == "rule"
    assert "8 requirements" in r["answer"]  # real count from this project's data
    assert "traceability" in r["answer"]
    assert "evidence" in r


def test_ask_requires_auth():
    with TestClient(app) as fresh:
        assert fresh.post("/projects/x/copilot/ask", json={"question": "hi"}).status_code in (401, 404)
