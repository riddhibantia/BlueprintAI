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


def test_password_reset_flow(client):
    client.post("/auth/register", json={"email": "reset@dev.blue", "password": "pass12345"})
    # wrong password stays rejected with a generic message (no enumeration)
    assert client.post("/auth/login", json={"email": "reset@dev.blue", "password": "wrongpass1"}).status_code == 401
    assert client.post("/auth/login", json={"email": "nobody@dev.blue", "password": "wrongpass1"}).status_code == 401
    # unknown email gets the same OK (existence never revealed)
    r = client.post("/auth/reset", json={"email": "nobody@dev.blue", "new_password": "newpass123"})
    assert r.status_code == 200
    # short replacement rejected at the boundary
    assert client.post("/auth/reset", json={"email": "reset@dev.blue", "new_password": "short"}).status_code == 422
    # real reset: new password works, old one doesn't
    r = client.post("/auth/reset", json={"email": "reset@dev.blue", "new_password": "newpass123"})
    assert r.status_code == 200 and "reset" in r.json()["message"].lower()
    assert client.post("/auth/login", json={"email": "reset@dev.blue", "password": "pass12345"}).status_code == 401
    assert client.post("/auth/login", json={"email": "reset@dev.blue", "password": "newpass123"}).status_code == 200
