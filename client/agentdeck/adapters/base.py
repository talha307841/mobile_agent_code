from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class AgentEvent:
    stream: str
    text: str = ""
    raw: dict[str, Any] = field(default_factory=dict)
    agent_session_id: str | None = None


class AgentAdapter(ABC):
    name: str

    def __init__(self) -> None:
        self._process: asyncio.subprocess.Process | None = None

    @abstractmethod
    async def run(
        self, prompt: str, cwd: Path, resume_session_id: str | None = None
    ) -> AsyncIterator[AgentEvent]:
        yield AgentEvent("system")

    async def cancel(self) -> None:
        if self._process and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except asyncio.TimeoutError:
                self._process.kill()
                await self._process.wait()
