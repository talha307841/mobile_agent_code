from datetime import datetime, timezone
from uuid import UUID

from agentdeck_protocol import Envelope, MessageType, TaskState
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..dependencies import CurrentUser, Db
from ..models import AgentSession, Approval, Device, Repository, Task, TaskLog
from ..schemas import ApprovalDecision, ApprovalView, LogView, SessionView, TaskCreate, TaskView
from ..services.audit import record_audit
from ..services.hub import hub

router = APIRouter(tags=["tasks"])


@router.post("/tasks", response_model=TaskView, status_code=201)
async def create_task(body: TaskCreate, user: CurrentUser, db: Db) -> Task:
    prior = await db.scalar(
        select(Task).where(Task.user_id == user.id, Task.idempotency_key == body.idempotency_key)
    )
    if prior:
        return prior
    device = await db.scalar(
        select(Device).where(
            Device.id == body.device_id, Device.user_id == user.id, Device.revoked.is_(False)
        )
    )
    repo = await db.scalar(
        select(Repository).where(
            Repository.id == body.repository_id,
            Repository.device_id == body.device_id,
            Repository.enabled.is_(True),
        )
    )
    if device is None or repo is None:
        raise HTTPException(status_code=404, detail="Device or repository not found")
    if not hub.device_online(device.id):
        raise HTTPException(status_code=409, detail="Device is offline")
    session = None
    if body.session_id:
        session = await db.scalar(
            select(AgentSession).where(
                AgentSession.id == body.session_id,
                AgentSession.user_id == user.id,
                AgentSession.device_id == device.id,
                AgentSession.repository_id == repo.id,
            )
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = AgentSession(
            user_id=user.id,
            device_id=device.id,
            repository_id=repo.id,
            agent=body.agent or device.default_agent,
            title=body.prompt[:200],
        )
        db.add(session)
        await db.flush()
    task = Task(
        user_id=user.id,
        session_id=session.id,
        device_id=device.id,
        repository_id=repo.id,
        prompt=body.prompt,
        state=TaskState.QUEUED,
        idempotency_key=body.idempotency_key,
    )
    db.add(task)
    await db.flush()
    sent = await hub.send_device(
        device.id,
        Envelope(
            type=MessageType.TASK_START,
            idempotency_key=body.idempotency_key,
            payload={
                "task_id": str(task.id),
                "session_id": str(session.id),
                "repository_id": str(repo.id),
                "repository_path": repo.path,
                "prompt": body.prompt,
                "agent": session.agent,
                "resume_agent_session_id": session.agent_session_id,
            },
        ),
    )
    if not sent:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Device disconnected")
    record_audit(
        db,
        "task.dispatched",
        user_id=user.id,
        device_id=device.id,
        details={"task_id": str(task.id), "repository_id": str(repo.id)},
    )
    await db.commit()
    return task


@router.get("/tasks", response_model=list[TaskView])
async def list_tasks(
    user: CurrentUser, db: Db, device_id: UUID | None = None, limit: int = 50
) -> list[Task]:
    query = select(Task).where(Task.user_id == user.id)
    if device_id:
        query = query.where(Task.device_id == device_id)
    return list(
        (await db.scalars(query.order_by(Task.created_at.desc()).limit(min(limit, 200)))).all()
    )


@router.get("/tasks/{task_id}", response_model=TaskView)
async def get_task(task_id: UUID, user: CurrentUser, db: Db) -> Task:
    task = await db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/tasks/{task_id}/logs", response_model=list[LogView])
async def get_logs(task_id: UUID, user: CurrentUser, db: Db, after: int = -1) -> list[TaskLog]:
    if not await db.scalar(select(Task.id).where(Task.id == task_id, Task.user_id == user.id)):
        raise HTTPException(status_code=404, detail="Task not found")
    return list(
        (
            await db.scalars(
                select(TaskLog)
                .where(TaskLog.task_id == task_id, TaskLog.sequence > after)
                .order_by(TaskLog.sequence)
            )
        ).all()
    )


@router.post("/tasks/{task_id}/cancel", response_model=TaskView)
async def cancel_task(task_id: UUID, user: CurrentUser, db: Db) -> Task:
    task = await db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.state in {TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED}:
        return task
    if not await hub.send_device(
        task.device_id, Envelope(type=MessageType.TASK_CANCEL, payload={"task_id": str(task.id)})
    ):
        task.state = TaskState.CANCELLED
    record_audit(
        db,
        "task.cancel.requested",
        user_id=user.id,
        device_id=task.device_id,
        details={"task_id": str(task.id)},
    )
    await db.commit()
    return task


@router.post("/tasks/{task_id}/input", status_code=202)
async def task_input(task_id: UUID, body: dict, user: CurrentUser, db: Db) -> dict:
    task = await db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    text = body.get("text", "")
    if task is None or not isinstance(text, str) or not text.strip():
        raise HTTPException(status_code=400, detail="Invalid task or input")
    sent = await hub.send_device(
        task.device_id,
        Envelope(
            type=MessageType.TASK_INPUT, payload={"task_id": str(task.id), "text": text[:100_000]}
        ),
    )
    if not sent:
        raise HTTPException(status_code=409, detail="Device is offline")
    return {"accepted": True}


@router.get("/sessions", response_model=list[SessionView])
async def sessions(user: CurrentUser, db: Db, device_id: UUID | None = None) -> list[AgentSession]:
    query = select(AgentSession).where(AgentSession.user_id == user.id)
    if device_id:
        query = query.where(AgentSession.device_id == device_id)
    return list((await db.scalars(query.order_by(AgentSession.updated_at.desc()).limit(100))).all())


@router.get("/approvals", response_model=list[ApprovalView])
async def approvals(user: CurrentUser, db: Db, status: str = "PENDING") -> list[Approval]:
    return list(
        (
            await db.scalars(
                select(Approval)
                .where(Approval.user_id == user.id, Approval.status == status)
                .order_by(Approval.requested_at.desc())
            )
        ).all()
    )


@router.post("/approvals/{approval_id}", response_model=ApprovalView)
async def decide_approval(
    approval_id: UUID, body: ApprovalDecision, user: CurrentUser, db: Db
) -> Approval:
    approval = await db.scalar(
        select(Approval).where(Approval.id == approval_id, Approval.user_id == user.id)
    )
    if approval is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.status != "PENDING":
        raise HTTPException(status_code=409, detail="Approval already decided")
    approval.status = "APPROVED" if body.approved else "DENIED"
    approval.decided_at = datetime.now(timezone.utc)
    task = await db.get(Task, approval.task_id)
    if task:
        await hub.send_device(
            task.device_id,
            Envelope(
                type=MessageType.APPROVAL_RESPONSE,
                payload={
                    "approval_id": str(approval.id),
                    "task_id": str(task.id),
                    "approved": body.approved,
                },
            ),
        )
        record_audit(
            db,
            "approval.decided",
            user_id=user.id,
            device_id=task.device_id,
            details={"approval_id": str(approval.id), "approved": body.approved},
        )
    await db.commit()
    return approval
