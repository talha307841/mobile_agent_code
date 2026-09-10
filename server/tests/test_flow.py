import asyncio
from pathlib import Path
from uuid import uuid4

from agentdeck.adapters.mock import MockAdapter


def register_device(client, auth, name="Personal laptop", label="Personal"):
    response = client.post(
        "/api/v1/devices",
        headers=auth,
        json={"name": name, "label": label, "default_agent": "codex"},
    )
    assert response.status_code == 201
    return response.json()


def test_device_isolation(client, account, auth):
    own = register_device(client, auth)
    other_account = client.post(
        "/api/v1/auth/register",
        json={"email": "other@example.com", "password": "other secure password"},
    ).json()
    other_auth = {"Authorization": f"Bearer {other_account['access_token']}"}
    register_device(client, other_auth, "Work laptop", "Work")
    devices = client.get("/api/v1/devices", headers=auth).json()
    assert [item["id"] for item in devices] == [own["id"]]


def test_end_to_end_websocket_dispatch_stream_completion(client, account, auth):
    device = register_device(client, auth)
    repo_id = str(uuid4())
    with client.websocket_connect(f"/ws/device?token={device['credential']}") as laptop:
        laptop.send_json(
            {
                "type": "hello",
                "payload": {
                    "repositories": [{"id": repo_id, "name": "demo", "path": "/tmp/demo"}],
                    "metadata": {"agents": {"codex": True}},
                },
            }
        )
        assert laptop.receive_json()["type"] == "ack"
        listed = client.get("/api/v1/devices", headers=auth)
        assert listed.status_code == 200
        assert listed.json()[0]["online"] is True
        with client.websocket_connect(f"/ws/mobile?token={account['access_token']}") as mobile:
            response = client.post(
                "/api/v1/tasks",
                headers=auth,
                json={
                    "device_id": device["id"],
                    "repository_id": repo_id,
                    "prompt": "Inspect the tests",
                    "idempotency_key": "test-flow-0001",
                },
            )
            assert response.status_code == 201, response.text
            task = response.json()
            command = laptop.receive_json()
            assert command["type"] == "task.start"
            laptop.send_json(
                {
                    "type": "task.event",
                    "payload": {
                        "task_id": task["id"],
                        "sequence": 0,
                        "state": "STARTING",
                        "stream": "system",
                        "text": "Starting",
                    },
                }
            )
            assert mobile.receive_json()["type"] == "task.event"

            async def mock_run():
                return [
                    event
                    async for event in MockAdapter().run(command["payload"]["prompt"], Path("/tmp"))
                ]

            mocked_events = asyncio.run(mock_run())
            for sequence, event in enumerate(mocked_events, start=1):
                laptop.send_json(
                    {
                        "type": "task.event",
                        "payload": {
                            "task_id": task["id"],
                            "sequence": sequence,
                            "stream": event.stream,
                            "text": event.text,
                        },
                    }
                )
                assert mobile.receive_json()["type"] == "task.event"
            laptop.send_json(
                {
                    "type": "task.result",
                    "payload": {
                        "task_id": task["id"],
                        "state": "COMPLETED",
                        "result": {"diff": "ok"},
                        "agent_session_id": "session-1",
                    },
                }
            )
            assert mobile.receive_json()["type"] == "task.result"
    fetched = client.get(f"/api/v1/tasks/{task['id']}", headers=auth).json()
    assert fetched["state"] == "COMPLETED"
    assert fetched["result"]["diff"] == "ok"


def test_offline_device_rejected(client, auth):
    device = register_device(client, auth)
    response = client.post(
        "/api/v1/tasks",
        headers=auth,
        json={
            "device_id": device["id"],
            "repository_id": str(uuid4()),
            "prompt": "test",
            "idempotency_key": "offline-0001",
        },
    )
    assert response.status_code in (404, 409)


def test_repository_cannot_cross_devices(client, auth):
    first = register_device(client, auth, "First")
    second = register_device(client, auth, "Second")
    repo_id = str(uuid4())
    with client.websocket_connect(f"/ws/device?token={first['credential']}") as laptop:
        laptop.send_json(
            {
                "type": "hello",
                "payload": {
                    "repositories": [{"id": repo_id, "name": "private", "path": "/private"}]
                },
            }
        )
        laptop.receive_json()
    with client.websocket_connect(f"/ws/device?token={second['credential']}"):
        response = client.post(
            "/api/v1/tasks",
            headers=auth,
            json={
                "device_id": second["id"],
                "repository_id": repo_id,
                "prompt": "read files",
                "idempotency_key": "cross-device-0001",
            },
        )
        assert response.status_code == 404
