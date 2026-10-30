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


def test_password_change_requires_current_password(client):
    client.post("/auth/register", json={"email": "reset@dev.blue", "password": "pass12345"})
    # The old unauthenticated "reset by email" endpoint must stay gone:
    # it let anyone take over any account.
    assert client.post("/auth/reset", json={"email": "reset@dev.blue",
                                            "new_password": "newpass123"}).status_code == 404

    with TestClient(app) as anon:
        r = anon.post("/auth/password", json={"current_password": "pass12345",
                                              "new_password": "newpass123"})
    assert r.status_code == 401

    # Wrong current password and short replacement are both rejected.
    r = client.post("/auth/password", json={"current_password": "wrongpass1",
                                            "new_password": "newpass123"})
    assert r.status_code == 401
    r = client.post("/auth/password", json={"current_password": "pass12345",
                                            "new_password": "short"})
    assert r.status_code == 422

    # Real change: old password stops working, new one works.
    r = client.post("/auth/password", json={"current_password": "pass12345",
                                            "new_password": "newpass123"})
    assert r.status_code == 200 and "updated" in r.json()["message"].lower()
    client.post("/auth/logout")
    assert client.post("/auth/login", json={"email": "reset@dev.blue",
                                            "password": "pass12345"}).status_code == 401
    assert client.post("/auth/login", json={"email": "reset@dev.blue",
                                            "password": "newpass123"}).status_code == 200
