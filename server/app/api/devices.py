from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..core.security import hash_token, random_token
from ..dependencies import CurrentUser, Db
from ..models import Device, Repository
from ..schemas import DeviceRegister, DeviceRegistration, DeviceView, RepositoryView
from ..services.audit import record_audit
from ..services.hub import hub

router = APIRouter(prefix="/devices", tags=["devices"])


@router.post("", response_model=DeviceRegistration, status_code=201)
async def register_device(body: DeviceRegister, user: CurrentUser, db: Db) -> DeviceRegistration:
    credential = random_token()
    device = Device(
        user_id=user.id,
        name=body.name,
        label=body.label,
        default_agent=body.default_agent,
        credential_hash=hash_token(credential),
    )
    db.add(device)
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Device name already exists") from None
    record_audit(db, "device.registered", user_id=user.id, device_id=device.id)
    await db.commit()
    return DeviceRegistration(id=device.id, credential=credential)


@router.get("", response_model=list[DeviceView])
async def list_devices(user: CurrentUser, db: Db) -> list[DeviceView]:
    devices = list((await db.scalars(select(Device).where(Device.user_id == user.id, Device.revoked.is_(False)).order_by(Device.label, Device.name))).all())
    now = datetime.now(timezone.utc)
    result = []
    for device in devices:
        online = hub.device_online(device.id) and bool(device.last_seen_at and (now - device.last_seen_at).total_seconds() < 60)
        result.append(DeviceView.model_validate(device).model_copy(update={"online": online}))
    return result


@router.get("/{device_id}/repositories", response_model=list[RepositoryView])
async def repositories(device_id: UUID, user: CurrentUser, db: Db) -> list[Repository]:
    device = await db.scalar(select(Device).where(Device.id == device_id, Device.user_id == user.id, Device.revoked.is_(False)))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    return list((await db.scalars(select(Repository).where(Repository.device_id == device_id, Repository.enabled.is_(True)).order_by(Repository.name))).all())


@router.delete("/{device_id}", status_code=204)
async def revoke_device(device_id: UUID, user: CurrentUser, db: Db) -> None:
    device = await db.scalar(select(Device).where(Device.id == device_id, Device.user_id == user.id))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found")
    device.revoked = True
    record_audit(db, "device.revoked", user_id=user.id, device_id=device.id)
    await db.commit()

