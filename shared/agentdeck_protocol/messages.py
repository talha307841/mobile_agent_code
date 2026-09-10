from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class TaskState(str, Enum):
    QUEUED = "QUEUED"
    STARTING = "STARTING"
    ANALYZING = "ANALYZING"
    EDITING = "EDITING"
    TESTING = "TESTING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class MessageType(str, Enum):
    HELLO = "hello"
    HEARTBEAT = "heartbeat"
    HEARTBEAT_ACK = "heartbeat.ack"
    ACK = "ack"
    TASK_START = "task.start"
    TASK_CANCEL = "task.cancel"
    TASK_INPUT = "task.input"
    TASK_EVENT = "task.event"
    TASK_RESULT = "task.result"
    STATUS = "status"
    APPROVAL_REQUEST = "approval.request"
    APPROVAL_RESPONSE = "approval.response"
    ERROR = "error"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Envelope(BaseModel):
    version: int = 1
    id: UUID = Field(default_factory=uuid4)
    type: MessageType
    sent_at: datetime = Field(default_factory=utcnow)
    reply_to: UUID | None = None
    idempotency_key: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class TaskCommand(BaseModel):
    task_id: UUID
    session_id: UUID
    repository_id: UUID
    repository_path: str
    prompt: str
    agent: str
    resume_agent_session_id: str | None = None


class TaskEvent(BaseModel):
    task_id: UUID
    sequence: int
    state: TaskState | None = None
    stream: str = "system"
    text: str = ""
    raw: dict[str, Any] | None = None
