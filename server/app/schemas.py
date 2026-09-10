from __future__ import annotations

from datetime import datetime
from uuid import UUID

from agentdeck_protocol import TaskState
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserView(ORMModel):
    id: UUID
    email: str


class DeviceRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    label: str = Field(default="Personal", pattern="^(Work|Personal)$")
    default_agent: str = Field(default="codex", pattern="^(codex|claude)$")


class DeviceRegistration(BaseModel):
    id: UUID
    credential: str


class DeviceView(ORMModel):
    id: UUID
    name: str
    label: str
    default_agent: str
    last_seen_at: datetime | None
    online: bool = False
    metadata_json: dict


class RepositoryUpsert(BaseModel):
    id: UUID
    name: str = Field(min_length=1, max_length=100)
    path: str = Field(min_length=1, max_length=4096)


class RepositoryView(ORMModel):
    id: UUID
    device_id: UUID
    name: str
    path: str
    enabled: bool


class TaskCreate(BaseModel):
    device_id: UUID
    repository_id: UUID
    prompt: str = Field(min_length=1, max_length=100_000)
    agent: str | None = Field(default=None, pattern="^(codex|claude)$")
    session_id: UUID | None = None
    idempotency_key: str = Field(min_length=8, max_length=100)


class TaskView(ORMModel):
    id: UUID
    session_id: UUID
    device_id: UUID
    repository_id: UUID
    prompt: str
    state: TaskState
    error: str | None
    result: dict
    created_at: datetime
    updated_at: datetime


class LogView(ORMModel):
    sequence: int
    stream: str
    text: str
    payload: dict
    created_at: datetime


class SessionView(ORMModel):
    id: UUID
    device_id: UUID
    repository_id: UUID
    agent: str
    agent_session_id: str | None
    title: str
    created_at: datetime
    updated_at: datetime


class ApprovalDecision(BaseModel):
    approved: bool


class ApprovalView(ORMModel):
    id: UUID
    task_id: UUID
    action: str
    details: dict
    status: str
    requested_at: datetime
    decided_at: datetime | None
