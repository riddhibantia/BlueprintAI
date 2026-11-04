import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_password_reset_flow(client):
    email = "reset_user@dev.blue"
    # 1. Register user
    r = client.post("/auth/register", json={"email": email, "password": "OldPassword123!", "name": "Reset User"})
    assert r.status_code == 200

    # 2. Request password reset
    r = client.post("/auth/request-reset", json={"email": email})
    assert r.status_code == 200
    data = r.json()
    assert "If this email is registered" in data["message"]
    token = data.get("dev_token")
    assert token is not None

    # 3. Redeem reset token to change password
    r = client.post("/auth/reset-password", json={
        "email": email,
        "new_password": "BrandNewPassword123!",
        "reset_token": token
    })
    assert r.status_code == 200
    assert "Password reset successful" in r.json()["message"]

    # 4. Attempt to reuse spent token (must fail - single use)
    r_reuse = client.post("/auth/reset-password", json={
        "email": email,
        "new_password": "AnotherPassword123!",
        "reset_token": token
    })
    assert r_reuse.status_code == 400
    assert "already been used" in r_reuse.json()["detail"]

    # 5. Old password must fail login
    r_old = client.post("/auth/login", json={"email": email, "password": "OldPassword123!"})
    assert r_old.status_code == 401

    # 6. New password must succeed login
    r_new = client.post("/auth/login", json={"email": email, "password": "BrandNewPassword123!"})
    assert r_new.status_code == 200
    assert "token" in r_new.json()
