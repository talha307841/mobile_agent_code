from __future__ import annotations

import asyncio
import contextlib
import os
import platform
import re
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import websockets
from agentdeck_protocol import Envelope, MessageType, TaskState
from websockets import ClientConnection

from .adapters import AgentAdapter, create_adapter
from .config import ClientConfig, load_config, load_credential, resolve_allowed_repo
from .state import Outbox

DANGEROUS = {
    "git_push": re.compile(
        r"\b(git\s+push|push\s+(?:this|the)\s+(?:branch|changes|commit))\b", re.I
    ),
    "deployment": re.compile(r"\b(deploy|release\s+to\s+production|publish)\b", re.I),
    "database_migration": re.compile(
        r"\b(database|db)\s+migrat|\b(alembic|prisma|knex)\s+(upgrade|migrate|deploy)\b", re.I
    ),
    "destructive_command": re.compile(
        r"\b(rm\s+-rf|drop\s+(database|table)|reset\s+--hard|delete\s+all)\b", re.I
    ),
}


def reconnect_delay(attempt: int) -> float:
    """Capped exponential delay; callers may reconnect immediately after a healthy session."""
    return min(2 ** max(attempt, 0), 60)


@dataclass
class RunningTask:
    coroutine: asyncio.Task
    adapter: AgentAdapter


class Daemon:
    def __init__(
        self,
        config: ClientConfig | None = None,
        credential: str | None = None,
        outbox: Outbox | None = None,
    ) -> None:
        self.config = config or load_config()
        self.credential = credential or load_credential()
        self.outbox = outbox or Outbox()
        self.running: dict[str, RunningTask] = {}
        self.pending_approvals: dict[str, dict] = {}
        self.followups: dict[str, list[str]] = {}
        self._socket: ClientConnection | None = None
        self._send_lock = asyncio.Lock()

    @property
    def websocket_url(self) -> str:
        base = self.config.server_url.rstrip("/")
        scheme = "wss" if base.startswith("https://") else "ws"
        return f"{scheme}://{base.split('://', 1)[-1]}/ws/device"

    async def run_forever(self) -> None:
        delay = 1.0
        while True:
            try:
                async with websockets.connect(
                    self.websocket_url,
                    additional_headers={"Authorization": f"Bearer {self.credential}"},
                    max_size=2**22,
                    ping_interval=20,
                    ping_timeout=20,
                    close_timeout=5,
                ) as socket:
                    self._socket = socket
                    delay = 1.0
                    await self.send(
                        Envelope(
                            type=MessageType.HELLO,
                            payload={
                                "metadata": {
                                    "hostname": platform.node(),
                                    "platform": platform.platform(),
                                    "pid": os.getpid(),
                                    "agents": self._agent_status(),
                                },
                                "repositories": [
                                    repo.model_dump(mode="json")
                                    for repo in self.config.repositories
                                ],
                            },
                        ),
                        persist=False,
                    )
                    await self._flush_outbox()
                    heartbeat = asyncio.create_task(self._heartbeat())
                    try:
                        async for raw in socket:
                            await self.handle(Envelope.model_validate_json(raw))
                    finally:
                        heartbeat.cancel()
                        with contextlib.suppress(asyncio.CancelledError):
                            await heartbeat
            except asyncio.CancelledError:
                await self.shutdown()
                raise
            except Exception as error:
                print(f"Connection lost: {error}; retrying in {delay:.0f}s", flush=True)
                self._socket = None
                await asyncio.sleep(delay)
                delay = reconnect_delay(int(delay).bit_length())

    def _agent_status(self) -> dict:
        import shutil

        return {name: bool(shutil.which(name)) for name in ("codex", "claude")}

    async def _heartbeat(self) -> None:
        while True:
            await asyncio.sleep(15)
            await self.send(
                Envelope(
                    type=MessageType.HEARTBEAT,
                    payload={"hostname": platform.node(), "running_tasks": list(self.running)},
                ),
                persist=False,
            )

    async def _flush_outbox(self) -> None:
        for message in self.outbox.pending():
            try:
                await self.send(message, persist=False)
                self.outbox.remove(str(message.id))
            except Exception:
                break

    async def send(self, message: Envelope, *, persist: bool = True) -> None:
        if persist:
            self.outbox.add(message)
        if self._socket is None:
            return
        async with self._send_lock:
            await self._socket.send(message.model_dump_json())
        if persist:
            self.outbox.remove(str(message.id))

    async def handle(self, message: Envelope) -> None:
        if message.type == MessageType.TASK_START:
            task_id = message.payload["task_id"]
            if task_id in self.running:
                return
            dangerous = next(
                (
                    action
                    for action, pattern in DANGEROUS.items()
                    if pattern.search(message.payload["prompt"])
                ),
                None,
            )
            if dangerous:
                self.pending_approvals[task_id] = message.payload
                await self.send(
                    Envelope(
                        type=MessageType.APPROVAL_REQUEST,
                        payload={
                            "task_id": task_id,
                            "action": dangerous,
                            "details": {"prompt_excerpt": message.payload["prompt"][:500]},
                        },
                    )
                )
                return
            await self._start_task(message.payload)
        elif message.type == MessageType.TASK_CANCEL:
            running = self.running.get(message.payload["task_id"])
            if running:
                await running.adapter.cancel()
                running.coroutine.cancel()
                await asyncio.sleep(0)
            elif message.payload["task_id"] in self.pending_approvals:
                self.pending_approvals.pop(message.payload["task_id"], None)
                await self._result(message.payload["task_id"], TaskState.CANCELLED)
        elif message.type == MessageType.APPROVAL_RESPONSE:
            payload = self.pending_approvals.pop(message.payload["task_id"], None)
            if payload:
                if message.payload.get("approved"):
                    payload["prompt"] += (
                        f"\n\nAgentDeck approval grant: the user approved {message.payload.get('action', 'the requested protected action')}."
                    )
                    await self._start_task(payload)
                else:
                    await self._result(
                        payload["task_id"], TaskState.CANCELLED, error="User denied required action"
                    )
        elif message.type == MessageType.TASK_INPUT:
            task_id = message.payload["task_id"]
            running = self.running.get(task_id)
            self.followups.setdefault(task_id, []).append(message.payload["text"])
            await self.send(
                Envelope(
                    type=MessageType.TASK_EVENT,
                    payload={
                        "task_id": task_id,
                        "sequence": 2_000_000_000,
                        "stream": "system",
                        "text": "Follow-up queued and will run after the current turn."
                        if running
                        else message.payload["text"],
                    },
                )
            )

    async def _start_task(self, payload: dict) -> None:
        adapter = create_adapter(payload["agent"])
        coroutine = asyncio.create_task(self._execute(payload, adapter))
        self.running[payload["task_id"]] = RunningTask(coroutine, adapter)

    async def _execute(self, payload: dict, adapter: AgentAdapter) -> None:
        task_id = payload["task_id"]
        sequence = 0
        session_id = payload.get("resume_agent_session_id")
        try:
            repo = resolve_allowed_repo(
                self.config, UUID(payload["repository_id"]), payload["repository_path"]
            )
            await self._event(task_id, sequence, TaskState.STARTING, "Starting agent")
            sequence += 1
            prompt = payload["prompt"]
            while True:
                async for event in adapter.run(prompt, repo, session_id):
                    session_id = event.agent_session_id or session_id
                    await self._event(task_id, sequence, None, event.text, event.stream, event.raw)
                    sequence += 1
                queued = self.followups.get(task_id, [])
                if not queued:
                    break
                prompt = queued.pop(0)
            result = await git_snapshot(repo)
            await self._result(
                task_id, TaskState.COMPLETED, result=result, agent_session_id=session_id
            )
        except asyncio.CancelledError:
            await self._result(task_id, TaskState.CANCELLED, agent_session_id=session_id)
        except Exception as error:
            await self._result(
                task_id, TaskState.FAILED, error=str(error), agent_session_id=session_id
            )
        finally:
            self.running.pop(task_id, None)
            self.followups.pop(task_id, None)

    async def _event(
        self,
        task_id: str,
        sequence: int,
        state: TaskState | None,
        text: str,
        stream: str = "system",
        raw: dict | None = None,
    ) -> None:
        await self.send(
            Envelope(
                type=MessageType.TASK_EVENT,
                payload={
                    "task_id": task_id,
                    "sequence": sequence,
                    "state": state.value if state else None,
                    "stream": stream,
                    "text": text,
                    "raw": raw or {},
                },
            )
        )

    async def _result(
        self,
        task_id: str,
        state: TaskState,
        *,
        result: dict | None = None,
        error: str | None = None,
        agent_session_id: str | None = None,
    ) -> None:
        await self.send(
            Envelope(
                type=MessageType.TASK_RESULT,
                payload={
                    "task_id": task_id,
                    "state": state.value,
                    "result": result or {},
                    "error": error,
                    "agent_session_id": agent_session_id,
                },
            )
        )

    async def shutdown(self) -> None:
        for running in list(self.running.values()):
            await running.adapter.cancel()
            running.coroutine.cancel()


async def git_snapshot(repo: Path) -> dict:
    async def command(*args: str) -> str:
        process = await asyncio.create_subprocess_exec(
            "git", *args, cwd=repo, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, _ = await process.communicate()
        return stdout.decode(errors="replace")[:2_000_000]

    return {
        "branch": (await command("branch", "--show-current")).strip(),
        "status": await command("status", "--short"),
        "diff": await command("diff", "--no-ext-diff"),
        "changed_files": [line for line in (await command("status", "--short")).splitlines()],
    }
