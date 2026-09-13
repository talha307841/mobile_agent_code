from collections.abc import AsyncIterator
from pathlib import Path

from .base import AgentAdapter, AgentEvent


class MockAdapter(AgentAdapter):
    name = "mock"

    async def run(
        self,
        prompt: str,
        cwd: Path,
        resume_session_id: str | None = None,
        sandbox_bypass: bool = False,
    ) -> AsyncIterator[AgentEvent]:
        yield AgentEvent(
            "agent", f"Received: {prompt}", {"type": "mock"}, resume_session_id or "mock-session"
        )
        yield AgentEvent(
            "agent",
            "Mock task completed",
            {"type": "mock.complete"},
            resume_session_id or "mock-session",
        )
