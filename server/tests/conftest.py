import os

os.environ["AGENTDECK_DATABASE_URL"] = "sqlite+aiosqlite:///./test-agentdeck.db"
os.environ["AGENTDECK_JWT_SECRET"] = "test-secret-that-is-long-enough-for-tests"

import pytest
from fastapi.testclient import TestClient

from server.app.core.database import engine
from server.app.main import app
from server.app.models import Base


@pytest.fixture(autouse=True)
async def database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def account(client):
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "owner@example.com", "password": "correct horse battery staple"},
    )
    assert response.status_code == 201
    return response.json()


@pytest.fixture
def auth(account):
    return {"Authorization": f"Bearer {account['access_token']}"}
