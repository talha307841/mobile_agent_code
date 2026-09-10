from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select

from agentdeck_protocol import Envelope, MessageType, TaskState

from ..core.config import get_settings
from ..core.database import SessionLocal
from ..core.security import decode_jwt, hash_token
from ..models import AgentSession, Approval, Device, Repository, Task, TaskLog, User
from ..services.audit import record_audit
from ..services.hub import hub

router = APIRouter()


async def reject(socket: WebSocket, reason: str = "Unauthorized") -> None:
    await socket.close(code=4401, reason=reason)


@router.websocket("/ws/device")
async def device_socket(socket: WebSocket) -> None:
    raw = socket.query_params.get("token", "")
    async with SessionLocal() as db:
        device = await db.scalar(select(Device).where(Device.credential_hash == hash_token(raw), Device.revoked.is_(False)))
        if device is None:
            await reject(socket)
            return
        device_id, user_id = device.id, device.user_id
        await hub.connect_device(device_id, socket)
        device.last_seen_at = datetime.now(timezone.utc)
        record_audit(db, "device.connected", user_id=user_id, device_id=device_id)
        await db.commit()
    await hub.notify_user(user_id, Envelope(type=MessageType.STATUS, payload={"device_id": str(device_id), "online": True}))
    try:
        while True:
            envelope = Envelope.model_validate_json(await socket.receive_text())
            await _handle_device_message(device_id, user_id, envelope)
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        await hub.disconnect_device(device_id, socket)
        async with SessionLocal() as db:
            record_audit(db, "device.disconnected", user_id=user_id, device_id=device_id)
            await db.commit()
        await hub.notify_user(user_id, Envelope(type=MessageType.STATUS, payload={"device_id": str(device_id), "online": False}))


async def _handle_device_message(device_id: UUID, user_id: UUID, envelope: Envelope) -> None:
    async with SessionLocal() as db:
        device = await db.get(Device, device_id)
        if device is None:
            return
        device.last_seen_at = datetime.now(timezone.utc)
        if envelope.type == MessageType.HEARTBEAT:
            device.metadata_json = envelope.payload
            await db.commit()
            await hub.send_device(device_id, Envelope(type=MessageType.HEARTBEAT_ACK, reply_to=envelope.id))
            return
        if envelope.type == MessageType.HELLO:
            device.metadata_json = envelope.payload.get("metadata", {})
            for item in envelope.payload.get("repositories", []):
                repo_id = UUID(item["id"])
                repo = await db.scalar(select(Repository).where(Repository.id == repo_id, Repository.device_id == device_id))
                if repo:
                    repo.name, repo.path, repo.enabled = item["name"], item["path"], True
                else:
                    db.add(Repository(id=repo_id, device_id=device_id, name=item["name"], path=item["path"]))
            await db.commit()
            await hub.send_device(device_id, Envelope(type=MessageType.ACK, reply_to=envelope.id))
            return
        task_id_raw = envelope.payload.get("task_id")
        if not task_id_raw:
            return
        task = await db.scalar(select(Task).where(Task.id == UUID(task_id_raw), Task.device_id == device_id, Task.user_id == user_id))
        if task is None:
            return
        if envelope.type == MessageType.TASK_EVENT:
            sequence = int(envelope.payload.get("sequence", 0))
            exists = await db.scalar(select(TaskLog.id).where(TaskLog.task_id == task.id, TaskLog.sequence == sequence))
            if not exists:
                db.add(TaskLog(task_id=task.id, sequence=sequence, stream=envelope.payload.get("stream", "system"), text=envelope.payload.get("text", "")[:1_000_000], payload=envelope.payload.get("raw") or {}))
            state = envelope.payload.get("state")
            if state in TaskState._value2member_map_:
                task.state = TaskState(state)
        elif envelope.type == MessageType.TASK_RESULT:
            state = envelope.payload.get("state", TaskState.FAILED.value)
            task.state = TaskState(state) if state in TaskState._value2member_map_ else TaskState.FAILED
            task.error = envelope.payload.get("error")
            task.result = envelope.payload.get("result") or {}
            agent_session_id = envelope.payload.get("agent_session_id")
            if agent_session_id:
                session = await db.get(AgentSession, task.session_id)
                if session:
                    session.agent_session_id = agent_session_id
        elif envelope.type == MessageType.APPROVAL_REQUEST:
            approval = Approval(user_id=user_id, task_id=task.id, action=envelope.payload.get("action", "unknown"), details=envelope.payload.get("details") or {})
            db.add(approval)
            await db.flush()
            envelope.payload["approval_id"] = str(approval.id)
            record_audit(db, "approval.requested", user_id=user_id, device_id=device_id, details={"task_id": str(task.id), "action": approval.action})
        record_audit(db, f"device.{envelope.type.value}", user_id=user_id, device_id=device_id, details={"task_id": str(task.id)})
        await db.commit()
    await hub.notify_user(user_id, envelope)


@router.websocket("/ws/mobile")
async def mobile_socket(socket: WebSocket) -> None:
    token = socket.query_params.get("token", "")
    try:
        user_id = decode_jwt(token, get_settings(), "access")
    except (jwt.InvalidTokenError, ValueError):
        await reject(socket)
        return
    async with SessionLocal() as db:
        if await db.get(User, user_id) is None:
            await reject(socket)
            return
    await hub.connect_user(user_id, socket)
    try:
        while True:
            envelope = Envelope.model_validate_json(await socket.receive_text())
            if envelope.type == MessageType.HEARTBEAT:
                await socket.send_text(Envelope(type=MessageType.HEARTBEAT_ACK, reply_to=envelope.id).model_dump_json())
    except (WebSocketDisconnect, ValueError):
        pass
    finally:
        await hub.disconnect_user(user_id, socket)

