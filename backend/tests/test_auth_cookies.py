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
    # no token at all is rejected the same way for known and unknown accounts
    r = client.post("/auth/reset", json={"email": "nobody@dev.blue", "new_password": "newpass123"})
    assert r.status_code == 401
    # short replacement rejected at the boundary
    assert client.post("/auth/reset", json={"email": "reset@dev.blue", "new_password": "short", "reset_token": "x"}).status_code == 422
    # an unauthenticated caller can never set a password without a token
    r = client.post("/auth/reset", json={"email": "reset@dev.blue", "new_password": "newpass123"})
    assert r.status_code == 401
    assert client.post("/auth/login", json={"email": "reset@dev.blue", "password": "pass12345"}).status_code == 200


def test_password_reset_requires_issued_token(client):
    """The full round trip: request a token, then spend it exactly once."""
    client.post("/auth/register", json={"email": "tok@dev.blue", "password": "pass12345"})
    issued = client.post("/auth/request-reset", json={"email": "tok@dev.blue"})
    assert issued.status_code == 200
    # In dev the token is returned so the flow is testable without a mail server.
    token = issued.json().get("reset_token")
    assert token, "dev reset must surface the token"
    r = client.post("/auth/reset", json={"email": "tok@dev.blue", "new_password": "newpass123", "reset_token": token})
    assert r.status_code == 200
    assert client.post("/auth/login", json={"email": "tok@dev.blue", "password": "newpass123"}).status_code == 200
    # the same token cannot be replayed
    r2 = client.post("/auth/reset", json={"email": "tok@dev.blue", "new_password": "thirdpass1", "reset_token": token})
    assert r2.status_code == 401


def test_reset_token_bound_to_one_account(client):
    """A token minted for A must not reset B."""
    client.post("/auth/register", json={"email": "acct-a@dev.blue", "password": "pass12345"})
    client.post("/auth/register", json={"email": "acct-b@dev.blue", "password": "pass12345"})
    token = client.post("/auth/request-reset", json={"email": "acct-a@dev.blue"}).json()["reset_token"]
    r = client.post("/auth/reset", json={"email": "acct-b@dev.blue", "new_password": "hijacked123", "reset_token": token})
    assert r.status_code == 401
    # acct-b's original password still works
    assert client.post("/auth/login", json={"email": "acct-b@dev.blue", "password": "pass12345"}).status_code == 200


def test_request_reset_does_not_reveal_existence(client):
    """Unknown email must give the identical response to a known one."""
    client.post("/auth/register", json={"email": "known@dev.blue", "password": "pass12345"})
    a = client.post("/auth/request-reset", json={"email": "known@dev.blue"})
    b = client.post("/auth/request-reset", json={"email": "ghost@dev.blue"})
    assert a.status_code == b.status_code == 200
    assert a.json()["message"] == b.json()["message"]


def test_garbage_reset_token_rejected(client):
    client.post("/auth/register", json={"email": "garbage@dev.blue", "password": "pass12345"})
    r = client.post("/auth/reset", json={"email": "garbage@dev.blue", "new_password": "newpass123", "reset_token": "not.a.jwt"})
    assert r.status_code == 401
    assert client.post("/auth/login", json={"email": "garbage@dev.blue", "password": "pass12345"}).status_code == 200


def test_session_token_is_not_a_reset_token(client):
    """A normal session JWT must not be spendable as a password reset token."""
    r = client.post("/auth/register", json={"email": "session@dev.blue", "password": "pass12345"})
    session_jwt = r.json()["token"]
    out = client.post("/auth/reset", json={"email": "session@dev.blue", "new_password": "newpass123", "reset_token": session_jwt})
    assert out.status_code == 401
