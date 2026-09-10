def test_register_login_refresh_and_reject_bad_password(client):
    created = client.post(
        "/api/v1/auth/register", json={"email": "A@Example.com", "password": "a-secure-password"}
    )
    assert created.status_code == 201
    assert (
        client.post(
            "/api/v1/auth/register",
            json={"email": "a@example.com", "password": "a-secure-password"},
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "a@example.com", "password": "wrong"}
        ).status_code
        == 401
    )
    logged_in = client.post(
        "/api/v1/auth/login", json={"email": "a@example.com", "password": "a-secure-password"}
    )
    assert logged_in.status_code == 200
    refreshed = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": logged_in.json()["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"] != logged_in.json()["access_token"]


def test_authentication_required(client):
    assert client.get("/api/v1/devices").status_code == 401
