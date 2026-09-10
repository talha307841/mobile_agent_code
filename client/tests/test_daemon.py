import asyncio
from uuid import uuid4

import pytest
from agentdeck.config import ClientConfig, RepoConfig
from agentdeck.daemon import Daemon, reconnect_delay
from agentdeck.state import Outbox
from agentdeck_protocol import Envelope, MessageType


@pytest.mark.asyncio
async def test_dangerous_task_requires_approval(tmp_path):
    repo_path = tmp_path / "repo"
    repo_path.mkdir()
    repo = RepoConfig(name="repo", path=str(repo_path))
    daemon = Daemon(ClientConfig(repositories=[repo]), "credential", Outbox(tmp_path / "outbox.db"))
    sent = []

    async def capture(message, persist=True):
        sent.append(message)

    daemon.send = capture
    task_id = str(uuid4())
    await daemon.handle(
        Envelope(
            type=MessageType.TASK_START,
            payload={
                "task_id": task_id,
                "repository_id": str(repo.id),
                "repository_path": str(repo_path),
                "prompt": "deploy this to production",
                "agent": "mock",
            },
        )
    )
    assert sent[0].type == MessageType.APPROVAL_REQUEST
    assert task_id in daemon.pending_approvals


@pytest.mark.asyncio
async def test_cancellation_stops_task(tmp_path):
    class Adapter:
        cancelled = False

        async def cancel(self):
            self.cancelled = True

    daemon = Daemon(ClientConfig(), "credential", Outbox(tmp_path / "outbox.db"))
    coroutine = asyncio.create_task(asyncio.sleep(10))
    from agentdeck.daemon import RunningTask

    adapter = Adapter()
    daemon.running["task"] = RunningTask(coroutine, adapter)
    await daemon.handle(Envelope(type=MessageType.TASK_CANCEL, payload={"task_id": "task"}))
    assert adapter.cancelled
    assert coroutine.cancelled()


def test_reconnect_backoff_is_exponential_and_capped():
    assert [reconnect_delay(i) for i in range(4)] == [1, 2, 4, 8]
    assert reconnect_delay(20) == 60
