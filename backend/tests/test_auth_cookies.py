"""httpOnly cookie session: login sets it, cookie alone authorizes, logout clears it."""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_cookie_login_and_me(client):
    r = client.post("/auth/register", json={"email": "cookie@dev.blue", "password": "pass12345"})
    assert r.status_code == 200
    assert "dbp_token" in (r.cookies or client.cookies)
    assert "httponly" in r.headers.get("set-cookie", "").lower()
    # No Authorization header from here on — cookie jar authorizes
    me = client.get("/auth/me")
    assert me.status_code == 200 and me.json()["email"] == "cookie@dev.blue"
    p = client.post("/projects", json={"name": "Cookie proj", "product_idea": "x"})
    assert p.status_code == 200


def test_logout_clears_session(client):
    assert client.post("/auth/logout").status_code == 200
    assert client.get("/auth/me").status_code == 401
