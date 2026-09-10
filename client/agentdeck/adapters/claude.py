from __future__ import annotations

import asyncio
import json
import shutil
from collections.abc import AsyncIterator
from pathlib import Path

from .base import AgentAdapter, AgentEvent


class ClaudeCodeAdapter(AgentAdapter):
    name = "claude"

    async def run(
        self, prompt: str, cwd: Path, resume_session_id: str | None = None
    ) -> AsyncIterator[AgentEvent]:
        binary = shutil.which("claude")
        if not binary:
            raise RuntimeError("Claude Code CLI is not installed or not on PATH")
        command = [
            binary,
            "-p",
            "--output-format",
            "stream-json",
            "--verbose",
            "--permission-mode",
            "default",
        ]
        if resume_session_id:
            command.extend(["--resume", resume_session_id])
        command.append(prompt)
        self._process = await asyncio.create_subprocess_exec(
            *command, cwd=cwd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        assert self._process.stdout and self._process.stderr
        session_id = None
        while line := await self._process.stdout.readline():
            text = line.decode(errors="replace").rstrip()
            try:
                event = json.loads(text)
                session_id = event.get("session_id", session_id)
                content = event.get("result") or event.get("message", {}).get("content") or ""
                yield AgentEvent("agent", str(content), event, session_id)
            except (json.JSONDecodeError, AttributeError):
                yield AgentEvent("stdout", text, agent_session_id=session_id)
        stderr = (await self._process.stderr.read()).decode(errors="replace").strip()
        code = await self._process.wait()
        if stderr:
            yield AgentEvent("stderr", stderr, agent_session_id=session_id)
        if code != 0:
            raise RuntimeError(f"Claude Code exited with status {code}")
