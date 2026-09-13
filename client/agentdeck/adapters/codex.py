from __future__ import annotations

import asyncio
import json
import shutil
from collections.abc import AsyncIterator
from pathlib import Path

from .base import AgentAdapter, AgentEvent, SandboxUnavailableError

BWRAP_PERMISSION_ERROR = "bwrap: No permissions to create a new namespace"


class CodexAdapter(AgentAdapter):
    name = "codex"

    async def run(
        self,
        prompt: str,
        cwd: Path,
        resume_session_id: str | None = None,
        sandbox_bypass: bool = False,
    ) -> AsyncIterator[AgentEvent]:
        binary = shutil.which("codex")
        if not binary:
            raise RuntimeError("Codex CLI is not installed or not on PATH")
        safety = (
            "\n\nRemote execution policy: Work only inside the current repository. "
            "Do not push, deploy, run database migrations, delete files outside ordinary code edits, "
            "or perform destructive commands unless this prompt contains an AgentDeck approval grant. "
            "Explain any blocked action in your final response."
        )
        if resume_session_id:
            command = [binary, "exec", "resume", resume_session_id, "--json", "-"]
            if sandbox_bypass:
                command.insert(-1, "--dangerously-bypass-approvals-and-sandbox")
        else:
            command = [binary, "exec", "--json"]
            if sandbox_bypass:
                command.append("--dangerously-bypass-approvals-and-sandbox")
            else:
                command.extend(["--sandbox", "workspace-write"])
            command.extend(["-C", str(cwd), "-"])
        self._process = await asyncio.create_subprocess_exec(
            *command,
            cwd=cwd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        assert self._process.stdin and self._process.stdout and self._process.stderr
        self._process.stdin.write((prompt + safety).encode())
        await self._process.stdin.drain()
        self._process.stdin.close()
        session_id = None
        sandbox_unavailable = False
        while line := await self._process.stdout.readline():
            text = line.decode(errors="replace").rstrip()
            try:
                event = json.loads(text)
                if event.get("type") == "thread.started":
                    session_id = event.get("thread_id")
                content = _event_text(event)
                if BWRAP_PERMISSION_ERROR in content:
                    sandbox_unavailable = True
                    continue
                if sandbox_unavailable:
                    continue
                if content:
                    stream = (
                        "command"
                        if (event.get("item") or {}).get("type") == "command_execution"
                        else "agent"
                    )
                    yield AgentEvent(stream, content, event, session_id)
            except json.JSONDecodeError:
                yield AgentEvent("stdout", text, agent_session_id=session_id)
        stderr = (await self._process.stderr.read()).decode(errors="replace").strip()
        code = await self._process.wait()
        if stderr:
            yield AgentEvent("stderr", stderr, agent_session_id=session_id)
        if sandbox_unavailable and not sandbox_bypass:
            raise SandboxUnavailableError(
                "Ubuntu blocked Codex's workspace sandbox; explicit one-time permission is required"
            )
        if code != 0:
            raise RuntimeError(f"Codex exited with status {code}")


def _event_text(event: dict) -> str:
    item = event.get("item") or {}
    if item.get("type") == "command_execution":
        if event.get("type") == "item.started":
            return str(item.get("command") or "")
        return str(item.get("aggregated_output") or "")
    return str(item.get("text") or event.get("message") or "")
