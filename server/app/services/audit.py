from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AuditLog


def record_audit(
    db: AsyncSession,
    event: str,
    *,
    user_id: UUID | None = None,
    device_id: UUID | None = None,
    details: dict | None = None,
    ip_address: str | None = None,
) -> None:
    db.add(AuditLog(event=event, user_id=user_id, device_id=device_id, details=details or {}, ip_address=ip_address))

